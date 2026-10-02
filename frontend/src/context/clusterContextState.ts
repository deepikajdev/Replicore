import { createContext } from 'react'
import type {
  ClusterStatus,
  ReplicationStatus,
  AuditEvent,
  HealthStatus,
} from '../types'

export interface ClusterContextType {
  cluster: ClusterStatus | null
  replication: ReplicationStatus | null
  events: AuditEvent[]
  totalEvents: number
  health: HealthStatus | null
  isLoading: boolean
  isBackendConnected: boolean
  lastUpdated: Date | null
  error: Error | null
  refreshCluster: () => Promise<void>
  refreshReplication: () => Promise<void>
  refreshEvents: () => Promise<void>
  refreshAll: () => Promise<void>
}

export const ClusterContext = createContext<ClusterContextType | null>(null)
