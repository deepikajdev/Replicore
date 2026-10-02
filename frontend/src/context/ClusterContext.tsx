import React, { useState, useEffect, useCallback, useRef } from 'react'
import type {
  ClusterStatus,
  ReplicationStatus,
  AuditEvent,
  HealthStatus,
  MetricsSample,
  ReplicaMetricsSample,
} from '../types'
import {
  fetchClusterStatus,
  fetchReplicationStatus,
  fetchClusterEvents,
  fetchHealth,
} from '../services/api'
import { ClusterContext } from './clusterContextState'

const MAX_HISTORY_SAMPLES = 60

export const ClusterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cluster, setCluster] = useState<ClusterStatus | null>(null)
  const [replication, setReplication] = useState<ReplicationStatus | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [totalEvents, setTotalEvents] = useState<number>(0)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [metricsHistory, setMetricsHistory] = useState<MetricsSample[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const isMountedRef = useRef(true)
  const isFetchingRef = useRef(false)
  const clusterRef = useRef<ClusterStatus | null>(null)
  const replicationRef = useRef<ReplicationStatus | null>(null)

  const refreshCluster = useCallback(async () => {
    try {
      const data = await fetchClusterStatus()
      if (isMountedRef.current) {
        setCluster(data)
        setIsBackendConnected(true)
        setError(null)
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setIsBackendConnected(false)
      }
    }
  }, [])

  const refreshReplication = useCallback(async () => {
    try {
      const data = await fetchReplicationStatus()
      if (isMountedRef.current) {
        setReplication(data)
      }
    } catch {
      // Ignored
    }
  }, [])

  const refreshEvents = useCallback(async () => {
    try {
      const data = await fetchClusterEvents(50)
      if (isMountedRef.current) {
        setEvents(data.events || [])
        setTotalEvents(data.total || 0)
      }
    } catch {
      // Ignored
    }
  }, [])

  const refreshAll = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      const [healthData, clusterData, replicationData, eventsData] = await Promise.allSettled([
        fetchHealth(),
        fetchClusterStatus(),
        fetchReplicationStatus(),
        fetchClusterEvents(50),
      ])

      if (isMountedRef.current) {
        let hasSuccess = false

        if (healthData.status === 'fulfilled') {
          setHealth(healthData.value)
          hasSuccess = true
        }

        if (clusterData.status === 'fulfilled') {
          clusterRef.current = clusterData.value
          setCluster(clusterData.value)
          hasSuccess = true
        }

        if (replicationData.status === 'fulfilled') {
          replicationRef.current = replicationData.value
          setReplication(replicationData.value)
          hasSuccess = true
        }

        if (eventsData.status === 'fulfilled') {
          setEvents(eventsData.value.events || [])
          setTotalEvents(eventsData.value.total || 0)
          hasSuccess = true
        }

        if (hasSuccess) {
          setIsBackendConnected(true)
          setError(null)
          setLastUpdated(new Date())

          const cVal = clusterData.status === 'fulfilled' ? clusterData.value : clusterRef.current
          const rVal = replicationData.status === 'fulfilled' ? replicationData.value : replicationRef.current

          if (cVal || rVal) {
            const primaryLsn = rVal?.primary_lsn ?? cVal?.current_primary_lsn ?? 0
            const replicas: ReplicaMetricsSample[] = []

            if (rVal?.replicas && rVal.replicas.length > 0) {
              for (const r of rVal.replicas) {
                replicas.push({
                  nodeId: r.node_id,
                  name: r.name,
                  appliedLsn: r.applied_lsn,
                  lagLsn: r.lag_lsn,
                  pendingQueue: r.pending_queue_count,
                })
              }
            } else if (cVal?.nodes) {
              for (const n of cVal.nodes) {
                if (n.role === 'REPLICA') {
                  replicas.push({
                    nodeId: n.id,
                    name: n.name,
                    appliedLsn: n.last_applied_lsn,
                    lagLsn: n.replication_lag_records,
                    pendingQueue: 0,
                  })
                }
              }
            }

            const now = new Date()
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            const sample: MetricsSample = {
              timestamp: timeStr,
              time: now.getTime(),
              primaryLsn,
              replicas,
            }

            for (const r of replicas) {
              sample[`${r.nodeId}_lag`] = r.lagLsn
              sample[`${r.nodeId}_applied`] = r.appliedLsn
              sample[`${r.nodeId}_queue`] = r.pendingQueue
            }

            setMetricsHistory((prev) => {
              const next = [...prev, sample]
              if (next.length > MAX_HISTORY_SAMPLES) {
                return next.slice(next.length - MAX_HISTORY_SAMPLES)
              }
              return next
            })
          }
        } else if (clusterData.status === 'rejected') {
          const reason =
            clusterData.reason instanceof Error
              ? clusterData.reason
              : new Error(String(clusterData.reason))
          setError(reason)
          setIsBackendConnected(false)
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setIsBackendConnected(false)
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
      isFetchingRef.current = false
    }
  }, [])

  // Live polling every 2.5 seconds (2500ms)
  useEffect(() => {
    isMountedRef.current = true

    const executePolling = async () => {
      await refreshAll()
    }

    void executePolling()

    const interval = setInterval(() => {
      void executePolling()
    }, 2500)

    return () => {
      isMountedRef.current = false
      clearInterval(interval)
    }
  }, [refreshAll])

  return (
    <ClusterContext.Provider
      value={{
        cluster,
        replication,
        events,
        totalEvents,
        health,
        metricsHistory,
        isLoading,
        isBackendConnected,
        lastUpdated,
        error,
        refreshCluster,
        refreshReplication,
        refreshEvents,
        refreshAll,
      }}
    >
      {children}
    </ClusterContext.Provider>
  )
}
