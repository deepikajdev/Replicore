import React, { useState, useEffect, useCallback, useRef } from 'react'
import type {
  ClusterStatus,
  ReplicationStatus,
  AuditEvent,
  HealthStatus,
} from '../types'
import {
  fetchClusterStatus,
  fetchReplicationStatus,
  fetchClusterEvents,
  fetchHealth,
} from '../services/api'
import { ClusterContext } from './clusterContextState'

export const ClusterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cluster, setCluster] = useState<ClusterStatus | null>(null)
  const [replication, setReplication] = useState<ReplicationStatus | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [totalEvents, setTotalEvents] = useState<number>(0)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const isMountedRef = useRef(true)
  const isFetchingRef = useRef(false)

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
          setCluster(clusterData.value)
          hasSuccess = true
        }

        if (replicationData.status === 'fulfilled') {
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
