import React from 'react'
import { RefreshCw, GitCommit, Layers, Inbox } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { StatCard } from '../components/StatCard'
import { StatusBadge } from '../components/StatusBadge'
import { ReplicationLagChart } from '../components/ReplicationLagChart'
import { LsnProgressChart } from '../components/LsnProgressChart'
import { ReplicaLagBarChart } from '../components/ReplicaLagBarChart'
import { useCluster } from '../hooks/useCluster'

export const ReplicationPage: React.FC = () => {
  const { replication, cluster, metricsHistory, isLoading } = useCluster()

  const replicas = replication?.replicas ?? []
  const primaryLsn = replication?.primary_lsn ?? cluster?.current_primary_lsn ?? 0
  const primaryNodeId = replication?.primary_node_id ?? cluster?.primary_node_id ?? 'None'
  const replicationMode = replication?.replication_mode ?? cluster?.replication_mode ?? 'ASYNC'

  let maxLag = 0
  let maxLagReplica: (typeof replicas)[0] | null = null
  for (const replica of replicas) {
    if (replica.lag_lsn > maxLag) {
      maxLag = replica.lag_lsn
      maxLagReplica = replica
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Replication Stream & Lag"
        description="Write-Ahead Log (WAL) transmission status, replica log sequence numbers, and artificial delay controls."
        action={
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-blue-950/50 border border-blue-800/60 text-blue-300 text-xs font-mono font-medium">
              Primary WAL Head: LSN {primaryLsn}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Replication Protocol"
          value={replicationMode}
          icon={<Layers className="w-4 h-4 text-purple-400" />}
          description="Non-blocking WAL stream"
          trend="Real-time"
          trendColor="success"
        />
        <StatCard
          title="Primary Commit Head"
          value={`LSN ${primaryLsn}`}
          icon={<GitCommit className="w-4 h-4 text-blue-400" />}
          description={`Leader: ${primaryNodeId}`}
          trend="Monotonic"
          trendColor="neutral"
        />
        <StatCard
          title="Max Replicas Lag"
          value={`${maxLag} LSN`}
          icon={<RefreshCw className="w-4 h-4 text-amber-400" />}
          description={
            maxLagReplica
              ? `Delayed by ${maxLagReplica.configured_delay_ms}ms on ${maxLagReplica.node_id}`
              : 'All replicas in sync'
          }
          trend={maxLagReplica ? maxLagReplica.node_id : 'In Sync'}
          trendColor={maxLag > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Real-time Telemetry Charts (Stage 4D) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReplicationLagChart
          history={metricsHistory}
          replicas={replicas}
          isLoading={isLoading}
        />
        <LsnProgressChart
          history={metricsHistory}
          replicas={replicas}
          isLoading={isLoading}
        />
      </div>

      {/* Replica Current Lag & Queue Comparison Chart */}
      <ReplicaLagBarChart replicas={replicas} isLoading={isLoading} />

      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">Replica Lag & Queue Metrics</h3>

        {replicas.length === 0 ? (
          <div className="py-12 text-center text-[#7d8590]">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {isLoading
                ? 'Fetching replication stream...'
                : 'No follower replicas currently registered in the replication stream.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#30363d] text-[#7d8590] uppercase tracking-wider">
                  <th className="py-2.5 px-3 font-medium">Replica</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Primary LSN</th>
                  <th className="py-2.5 px-3 font-medium">Applied LSN</th>
                  <th className="py-2.5 px-3 font-medium">Lag (LSN)</th>
                  <th className="py-2.5 px-3 font-medium">Configured Delay</th>
                  <th className="py-2.5 px-3 font-medium">Pending Queue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {replicas.map((replica) => (
                  <tr key={replica.node_id} className="hover:bg-[#1c2128]/50">
                    <td className="py-3 px-3 font-medium text-[#e6edf3]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{replica.node_id}</span>
                        <span className="text-[#7d8590] font-normal">({replica.name})</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={replica.status} />
                    </td>
                    <td className="py-3 px-3 font-mono text-[#7d8590]">{primaryLsn}</td>
                    <td className="py-3 px-3 font-mono font-semibold text-[#e6edf3]">
                      {replica.applied_lsn}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-mono font-semibold ${
                          replica.lag_lsn > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {replica.lag_lsn === 0 ? '0 (In Sync)' : `${replica.lag_lsn} records`}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#7d8590]">
                      {replica.configured_delay_ms} ms
                    </td>
                    <td className="py-3 px-3 font-mono text-[#7d8590]">
                      {replica.pending_queue_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
