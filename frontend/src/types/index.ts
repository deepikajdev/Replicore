// TypeScript types matching the backend Pydantic models exactly.
// Sources: backend/app/models/cluster.py and backend/app/models/data_record.py

// ----- Enums -----

export type NodeRole = 'PRIMARY' | 'REPLICA' | 'STANDBY'

export type NodeStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'ISOLATED'

export type ReplicationMode = 'ASYNC' | 'SYNC'

export type AuditEventType =
  | 'CLUSTER_STARTUP'
  | 'WRITE_RECORD'
  | 'REPLICATION_DELAY_UPDATED'
  | 'NODE_HEALTH_CHANGED'
  | 'HEARTBEAT_MISSED'
  | 'NODE_OUTAGE_SIMULATED'
  | 'NODE_RECOVERED'
  | 'FAILOVER_TRIGGERED'
  | 'NODE_PROMOTED'
  | 'DATA_CONSISTENCY_CHECK'
  | 'PRIMARY_FAILED'
  | 'FAILOVER_STARTED'
  | 'REPLICA_SELECTED'
  | 'EPOCH_INCREMENTED'
  | 'OLD_PRIMARY_FENCED'
  | 'FENCED_WRITE_REJECTED'

// ----- Node Models -----

export interface NodeMetrics {
  total_writes: number
  total_reads: number
  last_ping_latency_ms: number
  consecutive_failed_heartbeats: number
}

export interface NodeInfo {
  id: string
  name: string
  role: NodeRole
  status: NodeStatus
  replication_delay_ms: number
  last_applied_lsn: number
  replication_lag_records: number
  endpoint_url: string
  metrics: NodeMetrics
  last_heartbeat: string | null
  leadership_epoch: number
  is_fenced: boolean
}

// ----- Cluster Models -----

export interface ClusterStatus {
  cluster_name: string
  primary_node_id: string | null
  nodes: NodeInfo[]
  auto_failover_enabled: boolean
  replication_mode: ReplicationMode
  current_primary_lsn: number
  is_healthy: boolean
  current_epoch: number
}

// ----- Replication Models -----

export interface ReplicaLagInfo {
  node_id: string
  name: string
  role: NodeRole
  status: NodeStatus
  applied_lsn: number
  lag_lsn: number
  configured_delay_ms: number
  pending_queue_count: number
}

export interface ReplicationStatus {
  primary_node_id: string | null
  primary_lsn: number
  replication_mode: ReplicationMode
  replicas: ReplicaLagInfo[]
  timestamp: string
}

export type ReplicationStatusResponse = ReplicationStatus
export type ClusterState = ClusterStatus

// ----- Metrics / History Models (Stage 4D) -----

export interface ReplicaMetricsSample {
  nodeId: string
  name: string
  appliedLsn: number
  lagLsn: number
  pendingQueue: number
}

export interface MetricsSample {
  timestamp: string
  time: number
  primaryLsn: number
  replicas: ReplicaMetricsSample[]
  [key: string]: unknown
}

// ----- Health / System Models -----

export interface HealthStatus {
  status: string
  service: string
  version: string
  cluster_mode: 'local' | 'postgres' | string
  is_simulation: boolean
}

// ----- Audit / Event Models -----

export interface AuditEvent {
  id: string
  timestamp: string
  event_type: AuditEventType
  source_node: string | null
  description: string
  details: Record<string, unknown>
}

export interface AuditEventsResponse {
  total: number
  events: AuditEvent[]
}

// ----- Simulation / Operation Requests -----

export interface SetDelayRequest {
  node_id: string
  delay_ms: number
}

export interface NodeSimulationRequest {
  node_id: string
}

export interface ManualFailoverRequest {
  target_node_id: string
}

// ----- Data / Write Models -----

export interface RecordWriteRequest {
  key: string
  value: string
  target_node_id?: string
}

export interface RecordResponse {
  id: number | null
  key: string
  value: string
  version: number
  node_id: string
  node_role: string
  lsn: number | null
  created_at: string
  updated_at: string
}

export interface PromotionResult {
  promoted_node_id: string
  previous_primary_id: string | null
  new_epoch: number
  message: string
  timestamp: string
}

// ----- UI Utility Types -----

export type PageId = 'overview' | 'nodes' | 'replication' | 'events' | 'simulation'

export interface NavItem {
  id: PageId
  label: string
  icon: string
}

