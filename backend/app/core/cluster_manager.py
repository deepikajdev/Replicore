import uuid
from typing import Dict, List, Optional, Any
from backend.app.config import settings
from backend.app.models.cluster import (
    NodeRole,
    NodeStatus,
    ClusterState,
    AuditEvent,
    AuditEventType,
    ReplicationMode,
)
from backend.app.core.node import DatabaseNode
from backend.app.core.wal import WALManager

class ClusterManager:
    """
    Coordinates the database cluster nodes, WAL log sequencing, and audit event logging.
    """
    def __init__(self, base_data_dir: Optional[str] = None, auto_failover_enabled: Optional[bool] = None):
        self.base_data_dir = base_data_dir
        self.wal_manager = WALManager()
        self.nodes: Dict[str, DatabaseNode] = {}
        self.audit_events: List[AuditEvent] = []
        self.auto_failover_enabled = (
            auto_failover_enabled if auto_failover_enabled is not None else getattr(settings, "AUTO_FAILOVER_ENABLED", True)
        )
        self.replication_mode = ReplicationMode.ASYNC
        self.current_epoch: int = 1
        self._failover_in_progress: bool = False
        self._init_cluster()

    def _init_cluster(self):
        if settings.REPLICORE_CLUSTER_MODE == "postgres":
            primary_url = settings.PRIMARY_DB_URL
            r1_url = settings.REPLICA_1_DB_URL
            r2_url = settings.REPLICA_2_DB_URL
        elif self.base_data_dir:
            primary_url = f"sqlite:///{self.base_data_dir}/primary.db"
            r1_url = f"sqlite:///{self.base_data_dir}/replica_1.db"
            r2_url = f"sqlite:///{self.base_data_dir}/replica_2.db"
        else:
            primary_url = f"sqlite:///{settings.PRIMARY_SQLITE_PATH}"
            r1_url = f"sqlite:///{settings.REPLICA_1_SQLITE_PATH}"
            r2_url = f"sqlite:///{settings.REPLICA_2_SQLITE_PATH}"

        # Setup 1 Primary and 2 Replicas
        self.nodes["primary"] = DatabaseNode(
            node_id="primary",
            name="Primary Node (Leader)",
            role=NodeRole.PRIMARY,
            connection_url=primary_url,
            replication_delay_ms=0,
            event_logger=self.log_event
        )

        self.nodes["replica-1"] = DatabaseNode(
            node_id="replica-1",
            name="Replica Node 1 (Follower)",
            role=NodeRole.REPLICA,
            connection_url=r1_url,
            replication_delay_ms=settings.REPLICA_1_DELAY_MS,
            event_logger=self.log_event
        )

        self.nodes["replica-2"] = DatabaseNode(
            node_id="replica-2",
            name="Replica Node 2 (Follower)",
            role=NodeRole.REPLICA,
            connection_url=r2_url,
            replication_delay_ms=settings.REPLICA_2_DELAY_MS,
            event_logger=self.log_event
        )

        # Initialize schemas
        for node in self.nodes.values():
            node.initialize_schema()

        # Initialize Replication Manager
        from backend.app.core.replication_manager import ReplicationManager
        self.replication_manager = ReplicationManager(self.wal_manager, self.nodes)

        # Initialize Heartbeat Watchdog
        from backend.app.core.heartbeat_watchdog import HeartbeatWatchdog
        self.heartbeat_watchdog = HeartbeatWatchdog(
            self.nodes,
            event_logger=self.log_event,
            cluster_manager=self
        )

        self.log_event(
            AuditEventType.CLUSTER_STARTUP,
            source_node="cluster-orchestrator",
            description=f"Initialized cluster topology in {settings.REPLICORE_CLUSTER_MODE} mode with 1 Primary and 2 Replicas.",
            details={"nodes": list(self.nodes.keys())}
        )

    def get_primary(self) -> Optional[DatabaseNode]:
        for node in self.nodes.values():
            if node.role == NodeRole.PRIMARY and node.status == NodeStatus.HEALTHY:
                return node
        return None

    def get_node(self, node_id: str) -> Optional[DatabaseNode]:
        return self.nodes.get(node_id)

    def get_replicas(self) -> List[DatabaseNode]:
        return [n for n in self.nodes.values() if n.role == NodeRole.REPLICA]

    def log_event(
        self,
        event_type: AuditEventType,
        description: str,
        source_node: Optional[str] = None,
        details: Optional[Dict] = None
    ) -> AuditEvent:
        event = AuditEvent(
            id=str(uuid.uuid4())[:8],
            event_type=event_type,
            source_node=source_node,
            description=description,
            details=details or {}
        )
        self.audit_events.append(event)
        # Cap audit history to last 500 events
        if len(self.audit_events) > 500:
            self.audit_events.pop(0)
        return event

    def execute_write(self, key: str, value: str, target_node_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes a write strictly through the primary node (or specified target node).
        Generates a monotonically increasing WAL LSN, writes to the target node,
        and triggers the replication pipeline.
        """
        if target_node_id:
            target = self.get_node(target_node_id)
            if not target:
                raise KeyError(f"Node '{target_node_id}' does not exist in cluster.")
            if target.is_fenced:
                self.log_event(
                    AuditEventType.FENCED_WRITE_REJECTED,
                    source_node=target_node_id,
                    description=f"Rejected write to fenced node '{target_node_id}' (epoch {target.leadership_epoch} < current epoch {self.current_epoch}).",
                    details={"node_id": target_node_id, "epoch": target.leadership_epoch, "current_epoch": self.current_epoch, "key": key}
                )
                from backend.app.core.node import FencedLeaderError
                raise FencedLeaderError(
                    f"Write REJECTED: Node '{target_node_id}' has been fenced and is no longer the active PRIMARY. "
                    f"It was operating at epoch {target.leadership_epoch}. All writes must go to the current leader."
                )
            if target.role != NodeRole.PRIMARY:
                from backend.app.core.node import ReadOnlyReplicaError
                raise ReadOnlyReplicaError(
                    f"Cannot write: Node {target.node_id} is a read-only {target.role.value}. "
                    "Write operations must be directed to the cluster PRIMARY."
                )
            if target.status in [NodeStatus.DOWN, NodeStatus.ISOLATED] or target.simulated_unreachable:
                from backend.app.core.node import NodeUnreachableError
                raise NodeUnreachableError(f"Cannot write: Node {target.node_id} is {target.status.value}")
        else:
            primary = self.get_primary()
            if not primary:
                from backend.app.core.node import NodeUnreachableError
                raise NodeUnreachableError("No healthy primary node available to accept writes.")
            target = primary

        # 1. Append to cluster WAL
        wal_record = self.wal_manager.append_record(
            op_type="INSERT",
            record_key=key,
            payload={"value": value},
            primary_id=target.node_id
        )

        # 2. Write directly to node
        result = target.write_record(key=key, value=value, lsn=wal_record.lsn)

        # 3. Log event
        self.log_event(
            AuditEventType.WRITE_RECORD,
            source_node=target.node_id,
            description=f"Write committed at LSN {wal_record.lsn} for key '{key}'",
            details={"key": key, "lsn": wal_record.lsn, "version": result["version"]}
        )

        # 4. Trigger replication processing pass
        if hasattr(self, "replication_manager"):
            self.replication_manager.process_replication_step()

        return result

    def execute_read(self, node_id: Optional[str] = None, key: Optional[str] = None) -> Any:
        """
        Reads data from the specified node.
        If node_id is provided, reads strictly from that node.
        Raises NodeUnreachableError if the requested node is DOWN (no silent fallback).
        """
        target_node: Optional[DatabaseNode] = None

        if node_id:
            target_node = self.get_node(node_id)
            if not target_node:
                raise KeyError(f"Node '{node_id}' does not exist in cluster.")
        else:
            # Default to primary if available, else any healthy node
            target_node = self.get_primary()
            if not target_node:
                for node in self.nodes.values():
                    if node.status == NodeStatus.HEALTHY:
                        target_node = node
                        break

        if not target_node:
            from backend.app.core.node import NodeUnreachableError
            raise NodeUnreachableError("No healthy node available to service read request.")

        if key:
            return target_node.read_record(key)
        else:
            return target_node.get_all_records()

    def set_node_delay(self, node_id: str, delay_ms: int):
        """Updates the configured replication delay for a replica."""
        node = self.get_node(node_id)
        if not node:
            raise KeyError(f"Node '{node_id}' not found.")
        if node.role != NodeRole.REPLICA:
            raise ValueError(f"Node '{node_id}' is a {node.role.value}. Delay can only be set on REPLICA nodes.")
        if delay_ms < 0:
            raise ValueError(f"Replication delay cannot be negative (got {delay_ms}ms).")

        old_delay = node.replication_delay_ms
        node.replication_delay_ms = delay_ms

        self.log_event(
            AuditEventType.REPLICATION_DELAY_UPDATED,
            source_node=node_id,
            description=f"Replication delay for {node_id} adjusted from {old_delay}ms to {delay_ms}ms.",
            details={"node_id": node_id, "old_delay_ms": old_delay, "new_delay_ms": delay_ms}
        )

    def get_cluster_state(self) -> ClusterState:
        primary = self.get_primary()
        primary_id = primary.node_id if primary else None
        node_infos = [node.to_info() for node in self.nodes.values()]

        # Cluster is healthy if primary is alive and at least one replica is healthy
        healthy_nodes = [n for n in self.nodes.values() if n.status == NodeStatus.HEALTHY]
        is_healthy = (primary is not None) and (len(healthy_nodes) >= 2)

        return ClusterState(
            cluster_name="Replicore HA Cluster",
            primary_node_id=primary_id,
            nodes=node_infos,
            auto_failover_enabled=self.auto_failover_enabled,
            replication_mode=self.replication_mode,
            current_primary_lsn=self.wal_manager.current_lsn,
            is_healthy=is_healthy,
            current_epoch=self.current_epoch
        )

    def promote_replica(self, target_node_id: str) -> DatabaseNode:
        """
        Promotes the specified replica to PRIMARY.
        1. Validates target eligibility (must exist, be REPLICA, HEALTHY, reachable, not fenced).
        2. Concurrency control: prevents concurrent failover executions.
        3. Demotes and fences the old primary.
        4. Increments the cluster epoch.
        5. Flushes pending replication queue for target and reconfigures replication topology.
        6. Promotes the target with the new epoch.
        7. Emits audit events (FAILOVER_STARTED, OLD_PRIMARY_FENCED, EPOCH_INCREMENTED, NODE_PROMOTED).
        """
        if self._failover_in_progress:
            raise ValueError("Failover operation is already in progress.")

        target = self.get_node(target_node_id)
        if not target:
            raise KeyError(f"Target node '{target_node_id}' does not exist in cluster.")
        if target.role == NodeRole.PRIMARY:
            raise ValueError(f"Node '{target_node_id}' is already PRIMARY. Cannot promote an active primary.")
        if target.role != NodeRole.REPLICA:
            raise ValueError(f"Node '{target_node_id}' is a {target.role.value}. Only REPLICA nodes can be promoted.")
        if target.status in [NodeStatus.DOWN, NodeStatus.ISOLATED] or target.simulated_unreachable:
            raise ValueError(f"Node '{target_node_id}' is not eligible for promotion: status is {target.status.value}.")
        if target.is_fenced:
            raise ValueError(f"Node '{target_node_id}' is fenced and cannot be promoted.")

        self._failover_in_progress = True
        try:
            self.log_event(
                AuditEventType.FAILOVER_STARTED,
                source_node="cluster-orchestrator",
                description=f"Failover sequence initiated targeting replica '{target_node_id}'. Current epoch: {self.current_epoch}.",
                details={"target_replica": target_node_id, "current_epoch": self.current_epoch}
            )

            # Identify and demote the current primary (if any)
            old_primary = next((n for n in self.nodes.values() if n.role == NodeRole.PRIMARY), None)
            old_primary_id = old_primary.node_id if old_primary else None

            if old_primary:
                old_primary.demote()  # Sets is_fenced=True, role=REPLICA
                self.log_event(
                    AuditEventType.OLD_PRIMARY_FENCED,
                    source_node=old_primary_id,
                    description=f"Old primary '{old_primary_id}' demoted and fenced at epoch {old_primary.leadership_epoch}.",
                    details={"node_id": old_primary_id, "epoch": old_primary.leadership_epoch}
                )
                self.log_event(
                    AuditEventType.FAILOVER_TRIGGERED,
                    source_node=old_primary_id,
                    description=f"Primary '{old_primary_id}' demoted and fenced (epoch {old_primary.leadership_epoch}). Failover in progress.",
                    details={"fenced_node": old_primary_id, "trigger": "promotion"}
                )

            # Increment cluster leadership epoch
            old_epoch = self.current_epoch
            self.current_epoch += 1
            new_epoch = self.current_epoch

            self.log_event(
                AuditEventType.EPOCH_INCREMENTED,
                source_node="cluster-orchestrator",
                description=f"Cluster leadership epoch incremented from {old_epoch} to {new_epoch}.",
                details={"old_epoch": old_epoch, "new_epoch": new_epoch}
            )

            # Flush any unapplied WAL records for target before promotion
            if hasattr(self, "replication_manager"):
                self.replication_manager.flush_replica(target_node_id)

            # Promote target replica
            target.promote(new_epoch=new_epoch)
            target.status = NodeStatus.HEALTHY

            self.log_event(
                AuditEventType.NODE_PROMOTED,
                source_node=target_node_id,
                description=(
                    f"Node '{target_node_id}' promoted to PRIMARY at epoch {new_epoch}. "
                    f"Previous primary: '{old_primary_id}'."
                ),
                details={
                    "promoted_node": target_node_id,
                    "previous_primary": old_primary_id,
                    "new_epoch": new_epoch,
                    "applied_lsn_at_promotion": target.last_applied_lsn
                }
            )

            # Reconfigure replication pipeline topology
            if hasattr(self, "replication_manager"):
                self.replication_manager.reconfigure_topology()

            return target
        finally:
            self._failover_in_progress = False

    def trigger_automatic_failover(self) -> Optional[DatabaseNode]:
        """
        Automatically promotes the eligible replica with the highest applied LSN.
        Called by the HeartbeatWatchdog when auto-failover is enabled and the primary goes DOWN.
        """
        if self._failover_in_progress:
            return None

        # Verify whether there is already an active healthy primary
        active_primary = self.get_primary()
        if active_primary and active_primary.status == NodeStatus.HEALTHY and not active_primary.simulated_unreachable:
            return None

        down_primary = next(
            (n for n in self.nodes.values() if n.role == NodeRole.PRIMARY and (n.status == NodeStatus.DOWN or n.simulated_unreachable)),
            None
        )

        self.log_event(
            AuditEventType.FAILOVER_STARTED,
            source_node="cluster-orchestrator",
            description=f"Automatic failover initiated. Failed primary: '{down_primary.node_id if down_primary else 'unknown'}'.",
            details={"down_primary": down_primary.node_id if down_primary else None, "current_epoch": self.current_epoch}
        )

        candidates = [
            n for n in self.nodes.values()
            if n.role == NodeRole.REPLICA
            and n.status == NodeStatus.HEALTHY
            and not n.simulated_unreachable
            and not n.is_fenced
        ]

        if not candidates:
            # If no eligible replica exists, fence the down primary and leave cluster without an active primary
            if down_primary and not down_primary.is_fenced:
                down_primary.demote()
                self.log_event(
                    AuditEventType.OLD_PRIMARY_FENCED,
                    source_node=down_primary.node_id,
                    description=f"Primary '{down_primary.node_id}' demoted and fenced. No eligible replicas found.",
                    details={"node_id": down_primary.node_id, "epoch": down_primary.leadership_epoch}
                )

            self.log_event(
                AuditEventType.FAILOVER_TRIGGERED,
                source_node="cluster-orchestrator",
                description="Automatic failover aborted: No eligible replicas found for promotion.",
                details={"eligible_count": 0}
            )
            return None

        # Select the replica with highest applied LSN.
        # Deterministic tie-breaker: sort lexicographically by node_id.
        candidates.sort(key=lambda n: (-n.last_applied_lsn, n.node_id))
        best_candidate = candidates[0]

        self.log_event(
            AuditEventType.REPLICA_SELECTED,
            source_node=best_candidate.node_id,
            description=f"Replica '{best_candidate.node_id}' selected for promotion (applied LSN: {best_candidate.last_applied_lsn}).",
            details={
                "candidate": best_candidate.node_id,
                "applied_lsn": best_candidate.last_applied_lsn,
                "all_candidates": [c.node_id for c in candidates]
            }
        )

        return self.promote_replica(best_candidate.node_id)

    def simulate_node_failure(self, node_id: str):
        """Simulates an abrupt network partition or crash on the specified node."""
        node = self.get_node(node_id)
        if not node:
            raise KeyError(f"Node '{node_id}' does not exist.")
        node.simulated_unreachable = True
        self.log_event(
            AuditEventType.NODE_OUTAGE_SIMULATED,
            source_node=node_id,
            description=f"Simulated network outage/failure injected on node '{node_id}'.",
            details={"node_id": node_id, "role": node.role.value}
        )

    def recover_node(self, node_id: str):
        """Restores network connectivity or service on the specified node."""
        node = self.get_node(node_id)
        if not node:
            raise KeyError(f"Node '{node_id}' does not exist.")
        node.simulated_unreachable = False
        self.log_event(
            AuditEventType.NODE_RECOVERED,
            source_node=node_id,
            description=f"Connectivity restored for node '{node_id}'. Awaiting watchdog health check.",
            details={"node_id": node_id, "role": node.role.value}
        )

# Global cluster instance
cluster = ClusterManager()
