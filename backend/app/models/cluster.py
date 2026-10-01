from enum import Enum
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class NodeRole(str, Enum):
    PRIMARY = "PRIMARY"
    REPLICA = "REPLICA"
    STANDBY = "STANDBY"

class NodeStatus(str, Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"
    ISOLATED = "ISOLATED"

class ReplicationMode(str, Enum):
    ASYNC = "ASYNC"
    SYNC = "SYNC"

class AuditEventType(str, Enum):
    CLUSTER_STARTUP = "CLUSTER_STARTUP"
    WRITE_RECORD = "WRITE_RECORD"
    REPLICATION_DELAY_UPDATED = "REPLICATION_DELAY_UPDATED"
    NODE_HEALTH_CHANGED = "NODE_HEALTH_CHANGED"
    HEARTBEAT_MISSED = "HEARTBEAT_MISSED"
    NODE_OUTAGE_SIMULATED = "NODE_OUTAGE_SIMULATED"
    NODE_RECOVERED = "NODE_RECOVERED"
    FAILOVER_TRIGGERED = "FAILOVER_TRIGGERED"
    NODE_PROMOTED = "NODE_PROMOTED"
    DATA_CONSISTENCY_CHECK = "DATA_CONSISTENCY_CHECK"
    # Stage 3 Part 2 Failover, Election & Fencing Events
    PRIMARY_FAILED = "PRIMARY_FAILED"
    FAILOVER_STARTED = "FAILOVER_STARTED"
    REPLICA_SELECTED = "REPLICA_SELECTED"
    EPOCH_INCREMENTED = "EPOCH_INCREMENTED"
    OLD_PRIMARY_FENCED = "OLD_PRIMARY_FENCED"
    FENCED_WRITE_REJECTED = "FENCED_WRITE_REJECTED"

class AuditEvent(BaseModel):
    id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_type: AuditEventType
    source_node: Optional[str] = None
    description: str
    details: Dict[str, Any] = Field(default_factory=dict)

class NodeMetrics(BaseModel):
    total_writes: int = 0
    total_reads: int = 0
    last_ping_latency_ms: float = 0.0
    consecutive_failed_heartbeats: int = 0

class NodeInfo(BaseModel):
    id: str
    name: str
    role: NodeRole
    status: NodeStatus
    replication_delay_ms: int = 0
    last_applied_lsn: int = 0
    replication_lag_records: int = 0
    endpoint_url: str
    metrics: NodeMetrics = Field(default_factory=NodeMetrics)
    last_heartbeat: Optional[datetime] = None
    leadership_epoch: int = 1
    is_fenced: bool = False

class ClusterState(BaseModel):
    cluster_name: str = "Replicore Simulator Cluster"
    primary_node_id: Optional[str] = None
    nodes: List[NodeInfo] = Field(default_factory=list)
    auto_failover_enabled: bool = True
    replication_mode: ReplicationMode = ReplicationMode.ASYNC
    current_primary_lsn: int = 0
    is_healthy: bool = True
    current_epoch: int = 1

class ReplicaLagInfo(BaseModel):
    node_id: str
    name: str
    role: NodeRole
    status: NodeStatus
    applied_lsn: int
    lag_lsn: int
    configured_delay_ms: int
    pending_queue_count: int

class ReplicationStatusResponse(BaseModel):
    primary_node_id: Optional[str] = None
    primary_lsn: int = 0
    replication_mode: ReplicationMode = ReplicationMode.ASYNC
    replicas: List[ReplicaLagInfo] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SetDelayRequest(BaseModel):
    node_id: str = Field(..., description="Replica node identifier (e.g., replica-1)")
    delay_ms: int = Field(..., ge=0, le=60000, description="Replication delay in milliseconds (0 - 60,000ms)")

class NodeSimulationRequest(BaseModel):
    node_id: str = Field(..., description="Target node ID (e.g. primary, replica-1, replica-2)")

class ManualFailoverRequest(BaseModel):
    target_node_id: str = Field(..., description="Replica node ID to promote to PRIMARY.")

class PromotionResult(BaseModel):
    promoted_node_id: str
    previous_primary_id: Optional[str] = None
    new_epoch: int
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
