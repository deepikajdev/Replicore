import React from 'react'
import { Radio, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { ClusterStatus, ReplicationStatus } from '../types'

interface ClusterTelemetryCardProps {
  cluster: ClusterStatus | null
  replication: ReplicationStatus | null
  isBackendConnected: boolean
}

export const ClusterTelemetryCard: React.FC<ClusterTelemetryCardProps> = ({
  cluster,
  replication,
  isBackendConnected,
}) => {
  const primaryId = replication?.primary_node_id ?? cluster?.primary_node_id ?? 'None'
  const primaryLsn = replication?.primary_lsn ?? cluster?.current_primary_lsn ?? 0
  const epoch = cluster?.current_epoch ?? 1
  const replicationMode = replication?.replication_mode ?? cluster?.replication_mode ?? 'ASYNC'
  const replicas = replication?.replicas ?? []

  const laggingCount = replicas.filter((r) => r.lag_lsn > 0).length
  const totalPendingQueue = replicas.reduce((acc, r) => acc + r.pending_queue_count, 0)

  const primaryNode = cluster?.nodes.find((n) => n.id === primaryId)
  const isPrimaryHealthy = primaryNode?.status === 'HEALTHY'

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">
              Cluster Telemetry & Invariants
            </h3>
          </div>
          <p className="text-xs text-[#7d8590] mt-0.5">
            Distributed state consensus, replication engine parameters, and stream metrics
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${
            isPrimaryHealthy
              ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
              : 'bg-amber-950/40 border-amber-800/50 text-amber-300'
          }`}
        >
          {isPrimaryHealthy ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Leader Healthy
            </>
          ) : (
            <>
              <AlertCircle className="w-3 h-3 text-amber-400" />
              Leader Attention
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* Epoch */}
        <div className="p-3 rounded-md bg-[#0d1117] border border-[#30363d]">
          <div className="text-[11px] text-[#7d8590] uppercase tracking-wider mb-1">
            Consensus Epoch
          </div>
          <div className="text-base font-bold font-mono text-[#e6edf3]">
            {isBackendConnected ? `e-${epoch}` : '-'}
          </div>
          <div className="text-[10px] text-[#7d8590] mt-0.5">
            {cluster?.auto_failover_enabled ? 'Auto-failover armed' : 'Manual failover'}
          </div>
        </div>

        {/* Primary Node & LSN */}
        <div className="p-3 rounded-md bg-[#0d1117] border border-[#30363d]">
          <div className="text-[11px] text-[#7d8590] uppercase tracking-wider mb-1">
            Leader LSN Head
          </div>
          <div className="text-base font-bold font-mono text-blue-400">
            {isBackendConnected ? `LSN ${primaryLsn}` : '-'}
          </div>
          <div className="text-[10px] text-[#7d8590] mt-0.5 truncate">
            Node: {primaryId}
          </div>
        </div>

        {/* Replication Mode */}
        <div className="p-3 rounded-md bg-[#0d1117] border border-[#30363d]">
          <div className="text-[11px] text-[#7d8590] uppercase tracking-wider mb-1">
            Replication Mode
          </div>
          <div className="text-base font-bold font-mono text-purple-400">
            {isBackendConnected ? replicationMode : '-'}
          </div>
          <div className="text-[10px] text-[#7d8590] mt-0.5">
            {replicas.length} follower registered
          </div>
        </div>

        {/* Lagging Replicas / Pending Queue */}
        <div className="p-3 rounded-md bg-[#0d1117] border border-[#30363d]">
          <div className="text-[11px] text-[#7d8590] uppercase tracking-wider mb-1">
            Lagging / Pending
          </div>
          <div
            className={`text-base font-bold font-mono ${
              laggingCount > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {isBackendConnected ? `${laggingCount} lagging` : '-'}
          </div>
          <div className="text-[10px] text-[#7d8590] mt-0.5">
            Queue: {totalPendingQueue} records
          </div>
        </div>
      </div>
    </div>
  )
}
