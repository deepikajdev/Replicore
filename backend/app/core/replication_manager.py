import asyncio
import time
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

from backend.app.config import settings
from backend.app.models.cluster import (
    NodeRole,
    NodeStatus,
    ReplicationStatusResponse,
    ReplicaLagInfo,
    ReplicationMode
)
from backend.app.core.wal import WALRecord, WALManager
from backend.app.core.node import DatabaseNode

logger = logging.getLogger("replicore.replication")

class DelayedWALItem:
    def __init__(self, wal_record: WALRecord, apply_at: float):
        self.wal_record = wal_record
        self.apply_at = apply_at

class ReplicationManager:
    """
    Manages the application-level asynchronous replication pipeline.
    Replicas poll for unapplied WAL records from the primary's WALManager.
    An artificial delay is applied to simulate network latency and asynchronous replication lag.
    """
    def __init__(self, wal_manager: WALManager, nodes: Dict[str, DatabaseNode]):
        self.wal_manager = wal_manager
        self.nodes = nodes
        # Staging queues per replica: node_id -> List[DelayedWALItem]
        self._queues: Dict[str, List[DelayedWALItem]] = {
            nid: [] for nid, node in nodes.items() if node.role == NodeRole.REPLICA
        }
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        """Starts the background replication worker."""
        if not self._running:
            self._running = True
            try:
                loop = asyncio.get_running_loop()
                self._task = loop.create_task(self._replication_loop())
                logger.info("[ReplicationManager] Background replication worker started.")
            except RuntimeError:
                logger.info("[ReplicationManager] No running asyncio loop found; worker will run manually.")

    async def stop(self):
        """Gracefully stops the background replication worker."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("[ReplicationManager] Background replication worker stopped.")

    async def _replication_loop(self):
        poll_interval = settings.REPLICATION_POLL_INTERVAL_MS / 1000.0
        while self._running:
            try:
                self.process_replication_step()
            except Exception as e:
                logger.error(f"[ReplicationManager] Error during replication step: {e}")
            await asyncio.sleep(poll_interval)

    def reconfigure_topology(self):
        """
        Reconfigures replication queues following a primary promotion:
        - Removes the newly promoted primary from replica queues and clears its pending queue.
        - Ensures remaining active replicas have queues.
        - Clears/removes queues for fenced nodes so they do not replicate until rejoined.
        """
        for nid, node in self.nodes.items():
            if node.role == NodeRole.PRIMARY or node.is_fenced:
                self._queues.pop(nid, None)
                node.pending_wal_queue.clear()
            elif node.role == NodeRole.REPLICA and not node.is_fenced:
                if nid not in self._queues:
                    self._queues[nid] = []

    def process_replication_step(self):
        """
        Executes a single replication check across all replica nodes:
        1. Identifies unapplied WAL records from the primary.
        2. Schedules new records with the replica's configured delay.
        3. Applies records whose delay window has elapsed, provided the replica is online.
        """
        now = time.time()

        for node_id, queue in list(self._queues.items()):
            replica = self.nodes.get(node_id)
            if not replica or replica.role != NodeRole.REPLICA or replica.is_fenced:
                continue

            # 1. Fetch missing WAL records not yet in queue
            queued_lsns = {item.wal_record.lsn for item in queue}
            missing_records = self.wal_manager.get_records_since(replica.last_applied_lsn)

            for rec in missing_records:
                if rec.lsn not in queued_lsns:
                    delay_seconds = replica.replication_delay_ms / 1000.0
                    queue.append(DelayedWALItem(wal_record=rec, apply_at=now + delay_seconds))

            # Keep node's pending queue count updated for status reporting
            replica.pending_wal_queue = [item.wal_record.model_dump() for item in queue]

            # 2. If replica is DOWN or ISOLATED, do not apply changes (replication paused)
            if replica.status in [NodeStatus.DOWN, NodeStatus.ISOLATED]:
                continue

            # 3. Apply eligible delayed records in strict LSN order
            ready_items = [item for item in queue if now >= item.apply_at]
            for item in ready_items:
                try:
                    replica.apply_wal_record(item.wal_record)
                    queue.remove(item)
                except Exception as e:
                    logger.warning(f"[ReplicationManager] Failed to apply LSN {item.wal_record.lsn} to {node_id}: {e}")
                    break

            replica.pending_wal_queue = [item.wal_record.model_dump() for item in queue]

    def flush_replica(self, node_id: str):
        """Immediately applies all pending WAL records for a replica without waiting for delay."""
        replica = self.nodes.get(node_id)
        if not replica or node_id not in self._queues:
            return

        queue = self._queues[node_id]
        # Also queue any missing records from WAL manager
        missing = self.wal_manager.get_records_since(replica.last_applied_lsn)
        for rec in missing:
            if not any(item.wal_record.lsn == rec.lsn for item in queue):
                queue.append(DelayedWALItem(wal_record=rec, apply_at=0))

        if replica.status not in [NodeStatus.DOWN, NodeStatus.ISOLATED]:
            for item in list(queue):
                replica.apply_wal_record(item.wal_record)
                queue.remove(item)
            replica.pending_wal_queue.clear()

    def get_replication_status(self) -> ReplicationStatusResponse:
        primary = next((n for n in self.nodes.values() if n.role == NodeRole.PRIMARY), None)
        primary_id = primary.node_id if primary else None
        primary_lsn = self.wal_manager.current_lsn

        replicas_info: List[ReplicaLagInfo] = []
        for n in self.nodes.values():
            if n.role == NodeRole.REPLICA:
                lag = max(0, primary_lsn - n.last_applied_lsn)
                replicas_info.append(
                    ReplicaLagInfo(
                        node_id=n.node_id,
                        name=n.name,
                        role=n.role,
                        status=n.status,
                        applied_lsn=n.last_applied_lsn,
                        lag_lsn=lag,
                        configured_delay_ms=n.replication_delay_ms,
                        pending_queue_count=len(self._queues.get(n.node_id, []))
                    )
                )

        return ReplicationStatusResponse(
            primary_node_id=primary_id,
            primary_lsn=primary_lsn,
            replication_mode=ReplicationMode.ASYNC,
            replicas=replicas_info,
            timestamp=datetime.now(timezone.utc)
        )
