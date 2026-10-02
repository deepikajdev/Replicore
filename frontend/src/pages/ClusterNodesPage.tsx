import React from 'react'
import { Server, ShieldCheck, Heart, Inbox, Activity, Terminal, ShieldAlert } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { StatusBadge } from '../components/StatusBadge'
import { StatCard } from '../components/StatCard'
import { useCluster } from '../hooks/useCluster'

export const ClusterNodesPage: React.FC = () => {
  const { cluster, isLoading } = useCluster()

  const nodes = cluster?.nodes ?? []
  const primariesCount = nodes.filter((n) => n.role === 'PRIMARY').length
  const replicasCount = nodes.filter((n) => n.role === 'REPLICA').length
  const fencedCount = nodes.filter((n) => n.is_fenced).length
  const totalMissedHeartbeats = nodes.reduce(
    (sum, n) => sum + (n.metrics?.consecutive_failed_heartbeats ?? 0),
    0
  )

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Cluster Nodes & Topology"
        description="Detailed node metrics, role configuration, heartbeat watchdog status, and leadership epoch tracking."
        action={
          <div className="text-xs text-[#7d8590] bg-[#161b22] px-3 py-1.5 rounded border border-[#30363d] flex items-center gap-1.5">
            <span className="text-[#7d8590]">Total Fleet:</span>
            <span className="text-[#e6edf3] font-semibold font-mono">
              {nodes.length} {nodes.length === 1 ? 'Node' : 'Nodes'}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Topology"
          value={`${nodes.length} Nodes`}
          icon={<Server className="w-4 h-4 text-blue-400" />}
          description={`${primariesCount} Primary Leader, ${replicasCount} Replicas`}
          trend={nodes.length >= 2 ? 'Quorum Valid' : 'Degraded'}
          trendColor={nodes.length >= 2 ? 'success' : 'warning'}
        />
        <StatCard
          title="Heartbeat Watchdog"
          value={`${totalMissedHeartbeats} Missed`}
          icon={<Heart className="w-4 h-4 text-emerald-400" />}
          description="Detection threshold: 3 failures → DOWN"
          trend={totalMissedHeartbeats === 0 ? 'Heartbeats Stable' : 'Watchdog Alert'}
          trendColor={totalMissedHeartbeats === 0 ? 'success' : 'danger'}
        />
        <StatCard
          title="Consensus Leadership"
          value={`Epoch ${cluster?.current_epoch ?? 1}`}
          icon={<ShieldCheck className="w-4 h-4 text-purple-400" />}
          description={`Fenced split-brain nodes: ${fencedCount}`}
          trend={fencedCount > 0 ? 'Fencing Enforced' : 'No Split-Brain'}
          trendColor={fencedCount > 0 ? 'warning' : 'success'}
        />
      </div>

      {nodes.length === 0 ? (
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-12 text-center text-[#7d8590]">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-1">
            {isLoading ? 'Fetching cluster topology...' : 'No Nodes Detected'}
          </h2>
          <p className="text-xs">
            {isLoading
              ? 'Connecting to cluster watchdog...'
              : 'The cluster backend did not return any registered nodes.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {nodes.map((node) => {
            const isPrimary = node.role === 'PRIMARY'
            const isFenced = node.is_fenced
            const missedHeartbeats = node.metrics?.consecutive_failed_heartbeats ?? 0

            return (
              <div
                key={node.id}
                className={`rounded-lg border bg-[#161b22] p-4 sm:p-5 transition-all duration-150 ${
                  isFenced
                    ? 'border-rose-800/80 bg-rose-950/10'
                    : isPrimary
                    ? 'border-blue-700/60 shadow-[0_0_15px_rgba(88,166,255,0.06)]'
                    : 'border-[#30363d] hover:border-[#484f58]'
                }`}
              >
                {/* Node Card Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#21262d]">
                  <div className="flex items-start sm:items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-md border flex flex-col items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        isFenced
                          ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                          : isPrimary
                          ? 'bg-blue-950/60 border-blue-600/70 text-blue-300'
                          : 'bg-[#1c2128] border-[#30363d] text-[#58a6ff]'
                      }`}
                    >
                      <span>{isPrimary ? 'PRI' : node.id.replace('replica-', 'R')}</span>
                      <span className="text-[9px] font-normal text-[#7d8590]">e-{node.leadership_epoch}</span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-sm sm:text-base text-[#e6edf3]">
                          {node.name}
                        </h2>
                        <StatusBadge role={node.role} />
                        <StatusBadge status={node.status} />
                        {isFenced && <StatusBadge isFenced />}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-[#7d8590]">
                        <span className="font-mono flex items-center gap-1">
                          <Terminal className="w-3 h-3 text-[#7d8590]" aria-hidden="true" />
                          {node.endpoint_url}
                        </span>
                        {node.last_heartbeat && (
                          <span className="hidden sm:inline">
                            Heartbeat: {new Date(node.last_heartbeat).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right pill metadata */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded bg-[#0d1117] border border-[#30363d] font-mono text-[#7d8590]">
                      Replication Delay: <span className="text-[#e6edf3] font-semibold">{node.replication_delay_ms}ms</span>
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded bg-[#0d1117] border border-[#30363d] font-mono text-[#7d8590]">
                      Epoch: <span className="text-[#e6edf3] font-semibold">{node.leadership_epoch}</span>
                    </span>
                  </div>
                </div>

                {/* Node Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs">
                  <div className="p-2.5 rounded bg-[#0d1117]/60 border border-[#21262d]">
                    <span className="text-[#7d8590] block text-[11px] uppercase tracking-wider">Applied LSN</span>
                    <span className="font-mono text-base font-bold text-[#e6edf3] mt-1 block">
                      {node.last_applied_lsn}
                    </span>
                    <span className="text-[10px] text-[#7d8590]">
                      Lag: {node.replication_lag_records} records
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-[#0d1117]/60 border border-[#21262d]">
                    <span className="text-[#7d8590] block text-[11px] uppercase tracking-wider">Writes / Reads</span>
                    <span className="font-mono text-base font-bold text-[#e6edf3] mt-1 block">
                      {node.metrics?.total_writes ?? 0} <span className="text-[#7d8590] font-normal">/</span> {node.metrics?.total_reads ?? 0}
                    </span>
                    <span className="text-[10px] text-[#7d8590]">
                      {isPrimary ? 'Primary writes allowed' : 'Read-only replica'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-[#0d1117]/60 border border-[#21262d]">
                    <span className="text-[#7d8590] block text-[11px] uppercase tracking-wider">Ping Latency</span>
                    <span className="font-mono text-base font-bold text-[#3fb950] mt-1 block">
                      {(node.metrics?.last_ping_latency_ms ?? 0).toFixed(1)} ms
                    </span>
                    <span className="text-[10px] text-[#7d8590] flex items-center gap-1">
                      <Activity className="w-2.5 h-2.5 text-emerald-400" aria-hidden="true" />
                      Inter-node probe
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-[#0d1117]/60 border border-[#21262d]">
                    <span className="text-[#7d8590] block text-[11px] uppercase tracking-wider">Heartbeat Watchdog</span>
                    <span
                      className={`font-mono text-base font-bold mt-1 block ${
                        missedHeartbeats > 0 ? 'text-amber-400' : 'text-[#3fb950]'
                      }`}
                    >
                      {missedHeartbeats} / 3 failures
                    </span>
                    <span className="text-[10px] text-[#7d8590]">
                      {missedHeartbeats >= 3 ? 'Triggered failover' : 'Watchdog healthy'}
                    </span>
                  </div>
                </div>

                {isFenced && (
                  <div className="mt-3 p-2.5 rounded bg-rose-950/40 border border-rose-800/60 flex items-center gap-2 text-xs text-rose-200">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
                    <span>
                      <strong>Split-Brain Protection Active:</strong> This node was fenced after failover. Any attempted write to it will be rejected with HTTP 409 Conflict.
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
