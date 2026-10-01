import hashlib
import time
import os
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from sqlalchemy import create_engine, text, Engine
from backend.app.models.cluster import NodeRole, NodeStatus, NodeInfo, NodeMetrics, AuditEventType
from backend.app.core.wal import WALRecord

class NodeUnreachableError(Exception):
    """Raised when an operation is attempted on a node that is DOWN or ISOLATED."""
    pass

class ReadOnlyReplicaError(Exception):
    """Raised when a direct write is attempted on a replica node."""
    pass

class FencedLeaderError(Exception):
    """Raised when a write is attempted on an old primary that has been demoted or fenced."""
    pass

class DatabaseNode:
    """
    Represents an active database node in the Replicore cluster.
    Provides storage operations, health state management, and lag simulation.
    """
    def __init__(
        self,
        node_id: str,
        name: str,
        role: NodeRole,
        connection_url: str,
        replication_delay_ms: int = 0,
        event_logger: Optional[Any] = None
    ):
        self.node_id = node_id
        self.name = name
        self.role = role
        self.status = NodeStatus.HEALTHY
        self.connection_url = connection_url
        self.replication_delay_ms = replication_delay_ms
        self.last_applied_lsn = 0
        self.metrics = NodeMetrics()
        self.last_heartbeat: Optional[datetime] = datetime.now(timezone.utc)
        self.pending_wal_queue: List[Dict[str, Any]] = []
        self.simulated_unreachable: bool = False
        # Epoch tracks the cluster leadership generation. Used for fencing stale primaries.
        self.leadership_epoch: int = 1
        self.is_fenced: bool = False
        self.event_logger = event_logger

        # Initialize storage engine
        self._engine: Optional[Engine] = None
        self._init_engine()

    def _init_engine(self):
        # Ensure directories exist if using sqlite files
        if "sqlite:///" in self.connection_url:
            path = self.connection_url.replace("sqlite:///", "")
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
            self._engine = create_engine(self.connection_url, connect_args={"check_same_thread": False})
        else:
            self._engine = create_engine(self.connection_url, pool_pre_ping=True)

    def initialize_schema(self):
        """Creates the required tables on this database node."""
        if not self._engine:
            return

        with self._engine.begin() as conn:
            # Schema for business records
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key VARCHAR(255) UNIQUE NOT NULL,
                    value TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    lsn INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """))
            # Schema for node state tracking
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS node_state (
                    key VARCHAR(64) PRIMARY KEY,
                    value TEXT NOT NULL
                );
            """))
            conn.execute(text("""
                INSERT OR REPLACE INTO node_state (key, value)
                VALUES ('role', :role), ('last_applied_lsn', :lsn);
            """), {"role": self.role.value, "lsn": str(self.last_applied_lsn)})

    def ping(self) -> float:
        """
        Pings the underlying node connection to measure latency and verify availability.
        Returns latency in milliseconds.
        """
        if self.simulated_unreachable:
            raise NodeUnreachableError(f"Node {self.node_id} is unreachable (simulated network partition or host crash).")

        start = time.perf_counter()
        try:
            with self._engine.connect() as conn:
                conn.execute(text("SELECT 1;"))
            latency = (time.perf_counter() - start) * 1000.0
            self.metrics.last_ping_latency_ms = round(latency, 2)
            self.last_heartbeat = datetime.now(timezone.utc)
            return self.metrics.last_ping_latency_ms
        except Exception as e:
            raise NodeUnreachableError(f"Heartbeat check failed on node {self.node_id}: {str(e)}")

    def write_record(self, key: str, value: str, lsn: int) -> Dict[str, Any]:
        """
        Executes a write directly to this node.
        Only allowed if the node is PRIMARY, HEALTHY, and not fenced.
        """
        if self.is_fenced:
            if self.event_logger:
                try:
                    self.event_logger(
                        event_type=AuditEventType.FENCED_WRITE_REJECTED,
                        source_node=self.node_id,
                        description=(
                            f"Write REJECTED: Node '{self.node_id}' has been fenced (epoch {self.leadership_epoch}). "
                            f"Attempted write with LSN {lsn} for key '{key}' blocked."
                        ),
                        details={"node_id": self.node_id, "epoch": self.leadership_epoch, "lsn": lsn, "key": key}
                    )
                except Exception:
                    pass
            raise FencedLeaderError(
                f"Write REJECTED: Node '{self.node_id}' has been fenced and is no longer the active PRIMARY. "
                f"It was operating at epoch {self.leadership_epoch}. All writes must go to the current leader."
            )

        if self.status in [NodeStatus.DOWN, NodeStatus.ISOLATED] or self.simulated_unreachable:
            raise NodeUnreachableError(f"Cannot write: Node {self.node_id} is {self.status.value}")

        if self.role != NodeRole.PRIMARY:
            raise ReadOnlyReplicaError(
                f"Cannot write: Node {self.node_id} is a read-only {self.role.value}. "
                "Write operations must be directed to the cluster PRIMARY."
            )

        return self._apply_record_mutation(key, value, lsn)

    def apply_wal_record(self, wal_record: WALRecord) -> Dict[str, Any]:
        """
        Replays a replicated WAL record onto this node.
        Used by the replication pipeline for replicas.
        """
        if self.status in [NodeStatus.DOWN, NodeStatus.ISOLATED] or self.simulated_unreachable:
            raise NodeUnreachableError(f"Replication paused: Node {self.node_id} is {self.status.value}")

        key = wal_record.record_key
        value = wal_record.payload.get("value", "")
        lsn = wal_record.lsn

        result = self._apply_record_mutation(key, value, lsn)
        self.last_applied_lsn = lsn
        return result

    def _apply_record_mutation(self, key: str, value: str, lsn: int) -> Dict[str, Any]:
        now_str = datetime.now(timezone.utc).isoformat()
        with self._engine.begin() as conn:
            # Check existing record
            existing = conn.execute(
                text("SELECT id, version FROM records WHERE key = :key"),
                {"key": key}
            ).fetchone()

            if existing:
                rec_id = existing[0]
                new_version = existing[1] + 1
                conn.execute(
                    text("""
                        UPDATE records
                        SET value = :val, version = :ver, lsn = :lsn, updated_at = :now
                        WHERE id = :id
                    """),
                    {"val": value, "ver": new_version, "lsn": lsn, "now": now_str, "id": rec_id}
                )
            else:
                new_version = 1
                cursor = conn.execute(
                    text("""
                        INSERT INTO records (key, value, version, lsn, created_at, updated_at)
                        VALUES (:key, :val, :ver, :lsn, :now, :now)
                    """),
                    {"key": key, "val": value, "ver": new_version, "lsn": lsn, "now": now_str}
                )
                rec_id = cursor.lastrowid

            # Update node_state
            conn.execute(
                text("INSERT OR REPLACE INTO node_state (key, value) VALUES ('last_applied_lsn', :lsn)"),
                {"lsn": str(lsn)}
            )

        self.last_applied_lsn = lsn
        self.metrics.total_writes += 1

        return {
            "id": rec_id,
            "key": key,
            "value": value,
            "version": new_version,
            "lsn": lsn,
            "node_id": self.node_id,
            "node_role": self.role.value,
            "updated_at": now_str
        }

    def read_record(self, key: str) -> Optional[Dict[str, Any]]:
        """Reads a single record by key from this node."""
        if self.status in [NodeStatus.DOWN, NodeStatus.ISOLATED] or self.simulated_unreachable:
            raise NodeUnreachableError(f"Cannot read: Node {self.node_id} is {self.status.value}")

        with self._engine.connect() as conn:
            row = conn.execute(
                text("SELECT id, key, value, version, lsn, created_at, updated_at FROM records WHERE key = :key"),
                {"key": key}
            ).fetchone()

            self.metrics.total_reads += 1
            if not row:
                return None

            return {
                "id": row[0],
                "key": row[1],
                "value": row[2],
                "version": row[3],
                "lsn": row[4],
                "node_id": self.node_id,
                "node_role": self.role.value,
                "created_at": str(row[5]),
                "updated_at": str(row[6])
            }

    def get_all_records(self) -> List[Dict[str, Any]]:
        """Returns all records ordered by key."""
        if self.status in [NodeStatus.DOWN, NodeStatus.ISOLATED] or self.simulated_unreachable:
            raise NodeUnreachableError(f"Node {self.node_id} is {self.status.value}")

        with self._engine.connect() as conn:
            rows = conn.execute(
                text("SELECT key, value, version, lsn FROM records ORDER BY key ASC")
            ).fetchall()
            return [
                {"key": r[0], "value": r[1], "version": r[2], "lsn": r[3]}
                for r in rows
            ]

    def compute_checksum(self) -> str:
        """
        Computes a cryptographic hash of all records stored on this node.
        Allows instant comparison between Primary and Replicas to verify consistency.
        """
        if self.status in [NodeStatus.DOWN, NodeStatus.ISOLATED]:
            return "NODE_OFFLINE"

        records = self.get_all_records()
        hasher = hashlib.sha256()
        for rec in records:
            hasher.update(f"{rec['key']}:{rec['value']}:{rec['version']}:{rec['lsn']}|".encode('utf-8'))
        return hasher.hexdigest()

    def promote(self, new_epoch: int):
        """
        Promotes this node to PRIMARY with the given epoch.
        Clears any fencing state — this is the new authoritative leader.
        """
        self.role = NodeRole.PRIMARY
        self.leadership_epoch = new_epoch
        self.is_fenced = False
        self._update_node_state()

    def demote(self):
        """
        Demotes this node from PRIMARY to REPLICA and fences it.
        Any subsequent write attempts using this node will be rejected via FencedLeaderError.
        """
        self.role = NodeRole.REPLICA
        self.is_fenced = True
        self._update_node_state()

    def _update_node_state(self):
        if not self._engine:
            return
        try:
            with self._engine.begin() as conn:
                conn.execute(text("""
                    INSERT OR REPLACE INTO node_state (key, value)
                    VALUES ('role', :role), ('leadership_epoch', :epoch), ('is_fenced', :fenced);
                """), {"role": self.role.value, "epoch": str(self.leadership_epoch), "fenced": str(int(self.is_fenced))})
        except Exception:
            pass

    def to_info(self) -> NodeInfo:
        return NodeInfo(
            id=self.node_id,
            name=self.name,
            role=self.role,
            status=self.status,
            replication_delay_ms=self.replication_delay_ms,
            last_applied_lsn=self.last_applied_lsn,
            replication_lag_records=len(self.pending_wal_queue),
            endpoint_url=self.connection_url,
            metrics=self.metrics,
            last_heartbeat=self.last_heartbeat,
            leadership_epoch=self.leadership_epoch,
            is_fenced=self.is_fenced
        )
