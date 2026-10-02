import React from 'react'
import { Server, ShieldCheck, Heart, Inbox } from 'lucide-react'
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
          <div className="text-xs text-[#7d8590] bg-[#161b22] px-3 py-1.5 rounded border border-[#30363d]">
            Total Nodes:{' '}
            <span className="text-[#e6edf3] font-semibold">
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
          description={`${primariesCount} Primary, ${replicasCount} Replicas`}
          trend={nodes.length >= 2 ? 'Quorum Valid' : 'Degraded'}
          trendColor={nodes.length >= 2 ? 'success' : 'warning'}
        />
        <StatCard
          title="Heartbeat Watchdog"
          value={`${totalMissedHeartbeats} Missed`}
          icon={<Heart className="w-4 h-4 text-emerald-400" />}
          description="Threshold: 3 failures → DOWN"
          trend={totalMissedHeartbeats === 0 ? 'Stable' : 'Attention'}
          trendColor={totalMissedHeartbeats === 0 ? 'success' : 'danger'}
        />
        <StatCard
          title="Consensus Leadership"
          value={`Epoch ${cluster?.current_epoch ?? 1}`}
          icon={<ShieldCheck className="w-4 h-4 text-purple-400" />}
          description={`Fenced nodes: ${fencedCount}`}
          trend={fencedCount > 0 ? 'Fencing Active' : 'No Split-Brain'}
          trendColor={fencedCount > 0 ? 'warning' : 'success'}
        />
      </div>

      {nodes.length === 0 ? (
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-12 text-center text-[#7d8590]">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <h4 className="text-sm font-semibold text-[#e6edf3] mb-1">
            {isLoading ? 'Fetching cluster topology...' : 'No Nodes Detected'}
          </h4>
          <p className="text-xs">
            {isLoading
              ? 'Connecting to cluster watchdog...'
              : 'The cluster backend did not return any registered nodes.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {nodes.map((node) => (
            <div
              key={node.id}
              className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 hover:border-[#484f58] transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#21262d]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-[#1c2128] border border-[#30363d] flex items-center justify-center font-mono font-bold text-sm text-[#58a6ff]">
                    {node.id.replace('replica-', 'R').replace('primary', 'PRI')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-[#e6edf3]">{node.name}</h3>
                      <StatusBadge role={node.role} />
                      <StatusBadge status={node.status} />
                      {node.is_fenced && <StatusBadge isFenced />}
                    </div>
                    <p className="text-xs text-[#7d8590] font-mono mt-0.5">{node.endpoint_url}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded bg-[#0d1117] border border-[#30363d] font-mono text-[#7d8590]">
                    Epoch: <span className="text-[#e6edf3]">{node.leadership_epoch}</span>
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded bg-[#0d1117] border border-[#30363d] font-mono text-[#7d8590]">
                    Delay: <span className="text-[#e6edf3]">{node.replication_delay_ms}ms</span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs">
                <div>
                  <span className="text-[#7d8590] block">Applied LSN</span>
                  <span className="font-mono text-sm font-semibold text-[#e6edf3] mt-0.5 block">
                    {node.last_applied_lsn}
                  </span>
                </div>
                <div>
                  <span className="text-[#7d8590] block">Writes / Reads</span>
                  <span className="font-mono text-sm font-semibold text-[#e6edf3] mt-0.5 block">
                    {node.metrics?.total_writes ?? 0} / {node.metrics?.total_reads ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-[#7d8590] block">Ping Latency</span>
                  <span className="font-mono text-sm font-semibold text-[#3fb950] mt-0.5 block">
                    {(node.metrics?.last_ping_latency_ms ?? 0).toFixed(1)} ms
                  </span>
                </div>
                <div>
                  <span className="text-[#7d8590] block">Consecutive Failures</span>
                  <span
                    className={`font-mono text-sm font-semibold mt-0.5 block ${
                      (node.metrics?.consecutive_failed_heartbeats ?? 0) > 0
                        ? 'text-amber-400'
                        : 'text-[#e6edf3]'
                    }`}
                  >
                    {node.metrics?.consecutive_failed_heartbeats ?? 0} / 3
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
