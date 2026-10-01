import type {
  ClusterStatus,
  ReplicationStatus,
  AuditEventsResponse,
  RecordWriteRequest,
  RecordResponse,
  PromotionResult,
} from '../types'
import { ApiError } from './errors'

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`
  const headers = new Headers(options.headers ?? {})

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    })

    if (!res.ok) {
      let errorBody: unknown = null
      try {
        errorBody = await res.json()
      } catch {
        errorBody = await res.text()
      }

      const message =
        (errorBody as { detail?: string })?.detail ||
        (errorBody as { message?: string })?.message ||
        res.statusText ||
        'API Request Failed'

      throw new ApiError(message, res.status, res.statusText, errorBody)
    }

    return (await res.json()) as T
  } catch (err) {
    if (err instanceof ApiError) {
      throw err
    }
    throw new ApiError(
      err instanceof Error ? err.message : 'Network error or backend unreachable',
      0,
      'NetworkError'
    )
  }
}

export const api = {
  // Cluster endpoints
  getClusterStatus: (): Promise<ClusterStatus> =>
    request<ClusterStatus>('/api/cluster/status'),

  getReplicationStatus: (): Promise<ReplicationStatus> =>
    request<ReplicationStatus>('/api/cluster/replication'),

  getAuditEvents: (limit = 50): Promise<AuditEventsResponse> =>
    request<AuditEventsResponse>(`/api/cluster/events?limit=${encodeURIComponent(limit)}`),

  getWal: (): Promise<Record<string, unknown>> =>
    request<Record<string, unknown>>('/api/cluster/wal'),

  getHealth: (): Promise<{ status: string }> =>
    request<{ status: string }>('/health'),

  // Write operations
  writeRecord: (req: RecordWriteRequest): Promise<RecordResponse> =>
    request<RecordResponse>('/api/records', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  // Failover and Simulation operations
  triggerFailover: (targetNodeId?: string): Promise<PromotionResult> =>
    request<PromotionResult>('/api/cluster/failover', {
      method: 'POST',
      body: JSON.stringify(targetNodeId ? { target_node_id: targetNodeId } : {}),
    }),

  simulateNodeFailure: (nodeId: string): Promise<Record<string, unknown>> =>
    request<Record<string, unknown>>(`/api/cluster/nodes/${encodeURIComponent(nodeId)}/simulate-failure`, {
      method: 'POST',
    }),

  simulateNodeRecovery: (nodeId: string): Promise<Record<string, unknown>> =>
    request<Record<string, unknown>>(`/api/cluster/nodes/${encodeURIComponent(nodeId)}/simulate-recovery`, {
      method: 'POST',
    }),

  setReplicationDelay: (nodeId: string, delayMs: number): Promise<Record<string, unknown>> =>
    request<Record<string, unknown>>(`/api/cluster/nodes/${encodeURIComponent(nodeId)}/replication-delay`, {
      method: 'PATCH',
      body: JSON.stringify({ delay_ms: delayMs }),
    }),
}
