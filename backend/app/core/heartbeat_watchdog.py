import asyncio
import logging
from typing import Dict, Optional, Any, Callable
from datetime import datetime, timezone

from backend.app.config import settings
from backend.app.models.cluster import NodeStatus, AuditEventType
from backend.app.core.node import DatabaseNode, NodeUnreachableError

logger = logging.getLogger("replicore.watchdog")

class HeartbeatWatchdog:
    """
    Background watchdog service that periodically pings each node in the cluster.
    Tracks consecutive heartbeat failures and transitions unresponsive nodes to DOWN
    only when the configured threshold is breached.
    Detects node recoveries on subsequent successful pings.
    """
    def __init__(
        self,
        nodes: Dict[str, DatabaseNode],
        event_logger: Optional[Callable[..., Any]] = None,
        heartbeat_interval: Optional[float] = None,
        failure_threshold: Optional[int] = None,
        cluster_manager: Optional[Any] = None
    ):
        self.nodes = nodes
        self.event_logger = event_logger
        self.cluster_manager = cluster_manager
        self.heartbeat_interval = (
            heartbeat_interval if heartbeat_interval is not None else settings.HEARTBEAT_INTERVAL_SECONDS
        )
        self.failure_threshold = (
            failure_threshold if failure_threshold is not None else settings.MISSED_HEARTBEAT_THRESHOLD
        )
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        """Starts the background heartbeat watchdog task."""
        if not self._running:
            self._running = True
            try:
                loop = asyncio.get_running_loop()
                self._task = loop.create_task(self._watchdog_loop())
                logger.info("[HeartbeatWatchdog] Watchdog background worker started.")
            except RuntimeError:
                logger.info("[HeartbeatWatchdog] No active asyncio loop found; watchdog will run manually.")

    async def stop(self):
        """Gracefully cancels and stops the background watchdog task."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("[HeartbeatWatchdog] Watchdog background worker stopped.")

    async def _watchdog_loop(self):
        """Continuous async loop executing checks non-blockingly."""
        while self._running:
            try:
                # Offload blocking database pings to worker thread to avoid blocking the event loop
                await asyncio.to_thread(self.check_nodes_once)
            except Exception as e:
                logger.error(f"[HeartbeatWatchdog] Error during heartbeat sweep: {e}")
            await asyncio.sleep(self.heartbeat_interval)

    def check_nodes_once(self) -> Dict[str, Dict[str, Any]]:
        """
        Executes a single synchronous heartbeat sweep over all cluster nodes.
        Returns a dictionary of probe results per node.
        Used both by the background worker and directly in automated tests.
        """
        results = {}
        for node_id, node in self.nodes.items():
            results[node_id] = self._probe_node(node)
        return results

    def _probe_node(self, node: DatabaseNode) -> Dict[str, Any]:
        """Probes a single node and handles failure/recovery state transitions."""
        previous_status = node.status
        try:
            latency = node.ping()
            # --- Successful Heartbeat ---
            consecutive_failures = node.metrics.consecutive_failed_heartbeats
            node.metrics.consecutive_failed_heartbeats = 0

            # Detect Recovery if the node was previously DOWN or ISOLATED
            if previous_status in [NodeStatus.DOWN, NodeStatus.ISOLATED]:
                node.status = NodeStatus.HEALTHY
                self._log_event(
                    AuditEventType.NODE_RECOVERED,
                    source_node=node.node_id,
                    description=f"Node {node.node_id} has recovered and is now HEALTHY (ping: {latency}ms).",
                    details={
                        "node_id": node.node_id,
                        "previous_status": previous_status.value,
                        "new_status": node.status.value,
                        "latency_ms": latency
                    }
                )

            return {
                "node_id": node.node_id,
                "reachable": True,
                "latency_ms": latency,
                "status": node.status.value,
                "consecutive_failures": 0
            }

        except Exception as e:
            # --- Failed Heartbeat ---
            node.metrics.consecutive_failed_heartbeats += 1
            failures = node.metrics.consecutive_failed_heartbeats

            if failures < self.failure_threshold:
                # Sub-threshold failure: Do NOT mark DOWN yet, keep previous status, log warning
                self._log_event(
                    AuditEventType.HEARTBEAT_MISSED,
                    source_node=node.node_id,
                    description=(
                        f"Heartbeat probe failed for {node.node_id} "
                        f"({failures}/{self.failure_threshold} misses). Error: {str(e)}"
                    ),
                    details={
                        "node_id": node.node_id,
                        "consecutive_failures": failures,
                        "threshold": self.failure_threshold,
                        "status": node.status.value
                    }
                )
            else:
                # Threshold reached: Transition to DOWN if not already DOWN
                if node.status != NodeStatus.DOWN:
                    node.status = NodeStatus.DOWN
                    self._log_event(
                        AuditEventType.NODE_HEALTH_CHANGED,
                        source_node=node.node_id,
                        description=(
                            f"Node {node.node_id} marked DOWN after reaching failure threshold "
                            f"({failures} consecutive failed heartbeats)."
                        ),
                        details={
                            "node_id": node.node_id,
                            "previous_status": previous_status.value,
                            "new_status": NodeStatus.DOWN.value,
                            "consecutive_failures": failures,
                            "threshold": self.failure_threshold
                        }
                    )
                    # If the downed node is the PRIMARY, emit PRIMARY_FAILED and trigger auto-failover
                    from backend.app.models.cluster import NodeRole
                    if node.role == NodeRole.PRIMARY:
                        self._log_event(
                            AuditEventType.PRIMARY_FAILED,
                            source_node=node.node_id,
                            description=(
                                f"Primary node '{node.node_id}' failed and transitioned to DOWN "
                                f"after {failures} consecutive heartbeat misses."
                            ),
                            details={
                                "node_id": node.node_id,
                                "consecutive_failures": failures,
                                "epoch": node.leadership_epoch
                            }
                        )
                        if self.cluster_manager is not None and self.cluster_manager.auto_failover_enabled:
                            try:
                                promoted = self.cluster_manager.trigger_automatic_failover()
                                if promoted:
                                    logger.info(
                                        f"[Watchdog] Auto-failover: '{promoted.node_id}' promoted to PRIMARY "
                                        f"at epoch {promoted.leadership_epoch}."
                                    )
                            except Exception as fo_err:
                                logger.error(f"[Watchdog] Auto-failover failed: {fo_err}")

            return {
                "node_id": node.node_id,
                "reachable": False,
                "error": str(e),
                "status": node.status.value,
                "consecutive_failures": failures
            }

    def _log_event(self, event_type: AuditEventType, source_node: str, description: str, details: Dict[str, Any]):
        if self.event_logger:
            try:
                self.event_logger(
                    event_type=event_type,
                    description=description,
                    source_node=source_node,
                    details=details
                )
            except Exception as e:
                logger.error(f"[HeartbeatWatchdog] Failed to emit audit event: {e}")
