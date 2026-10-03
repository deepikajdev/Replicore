import type {
  ClusterStatus,
  ReplicationStatus,
  AuditEventsResponse,
  HealthStatus,
  RecordWriteRequest,
  RecordResponse,
  PromotionResult,
  SetDelayRequest,
  NodeSimulationRequest,
  ManualFailoverRequest,
} from '../types'
import { ApiError } from './errors'

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
// In development without an explicit VITE_API_BASE_URL, default to empty string so requests
// route through the existing Vite proxy (/api -> http://localhost:8000).
// In production, use VITE_API_BASE_URL configured for the deployment.
const BASE_URL: string = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : ''

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${BASE_URL}${normalizedEndpoint}`
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

// ----- Core Real API Services -----

export const fetchHealth = (): Promise<HealthStatus> =>
  request<HealthStatus>('/api/health')

export const fetchClusterStatus = (): Promise<ClusterStatus> =>
  request<ClusterStatus>('/api/cluster/status')

export const fetchClusterEvents = (limit = 50): Promise<AuditEventsResponse> =>
  request<AuditEventsResponse>(`/api/cluster/events?limit=${encodeURIComponent(limit)}`)

export const fetchReplicationStatus = (): Promise<ReplicationStatus> =>
  request<ReplicationStatus>('/api/cluster/replication')

// ----- Write & Read Operations -----

export const writeRecord = (
  req: RecordWriteRequest,
  targetNode?: string
): Promise<RecordResponse> => {
  const query = targetNode ? `?target_node=${encodeURIComponent(targetNode)}` : ''
  return request<RecordResponse>(`/api/data/write${query}`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export const readData = (
  node?: string,
  key?: string
): Promise<{
  requested_node: string
  key: string | null
  data: unknown
  is_stale_possible: boolean
}> => {
  const params = new URLSearchParams()
  if (node) params.append('node', node)
  if (key) params.append('key', key)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request(`/api/data/read${qs}`)
}

// ----- Failover & Simulation Operations -----

export const triggerFailover = (targetNodeId: string): Promise<PromotionResult> => {
  const payload: ManualFailoverRequest = { target_node_id: targetNodeId }
  return request<PromotionResult>('/api/cluster/failover', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const simulateNodeFailure = (nodeId: string): Promise<{ message: string; node_id: string; status: string }> => {
  const payload: NodeSimulationRequest = { node_id: nodeId }
  return request<{ message: string; node_id: string; status: string }>('/api/simulation/node/fail', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const simulateNodeRecovery = (nodeId: string): Promise<{ message: string; node_id: string; status: string }> => {
  const payload: NodeSimulationRequest = { node_id: nodeId }
  return request<{ message: string; node_id: string; status: string }>('/api/simulation/node/recover', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const setReplicationDelay = (
  nodeId: string,
  delayMs: number
): Promise<{ message: string; node_id: string; delay_ms: number }> => {
  const payload: SetDelayRequest = { node_id: nodeId, delay_ms: delayMs }
  return request<{ message: string; node_id: string; delay_ms: number }>('/api/simulation/delay', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ----- Centralized Export Object (Backwards Compatible) -----

export const api = {
  fetchHealth,
  fetchClusterStatus,
  fetchClusterEvents,
  fetchReplicationStatus,
  getHealth: fetchHealth,
  getClusterStatus: fetchClusterStatus,
  getClusterEvents: fetchClusterEvents,
  getAuditEvents: fetchClusterEvents,
  getReplicationStatus: fetchReplicationStatus,
  writeRecord,
  readData,
  triggerFailover,
  simulateNodeFailure,
  simulateNodeRecovery,
  setReplicationDelay,
}

