import React from 'react'
import { RefreshCw, GitCommit, Layers, Inbox, WifiOff } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { StatCard } from '../components/StatCard'
import { StatusBadge } from '../components/StatusBadge'
import { ReplicationLagChart } from '../components/ReplicationLagChart'
import { LsnProgressChart } from '../components/LsnProgressChart'
import { ReplicaLagBarChart } from '../components/ReplicaLagBarChart'
import { useCluster } from '../hooks/useCluster'

export const ReplicationPage: React.FC = () => {
  const { replication, cluster, metricsHistory, isLoading, isBackendConnected, refreshAll } = useCluster()

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
          description="Non-blocking WAL stream transmission"
          trend="Real-time"
          trendColor="success"
        />
        <StatCard
          title="Primary Commit Head"
          value={`LSN ${primaryLsn}`}
          icon={<GitCommit className="w-4 h-4 text-blue-400" />}
          description={`Active Leader: ${primaryNodeId}`}
          trend="Monotonic WAL"
          trendColor="neutral"
        />
        <StatCard
          title="Max Replicas Lag"
          value={`${maxLag} LSN`}
          icon={<RefreshCw className="w-4 h-4 text-amber-400" />}
          description={
            maxLagReplica
              ? `Delayed by ${maxLagReplica.configured_delay_ms}ms on ${maxLagReplica.node_id}`
              : 'All follower replicas caught up'
          }
          trend={maxLagReplica ? maxLagReplica.node_id : 'In Sync'}
          trendColor={maxLag > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Real-time Telemetry Charts */}
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

      {/* Replicas Detail Table */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[#e6edf3]">Replica Stream Telemetry & Queue</h2>
            <p className="text-xs text-[#7d8590] mt-0.5">Applied Log Sequence Number vs Primary WAL Head per follower</p>
          </div>
        </div>

        {!isBackendConnected && !isLoading ? (
          <div className="py-12 text-center text-[#7d8590]">
            <WifiOff className="w-8 h-8 mx-auto mb-2 text-rose-400 opacity-80" />
            <p className="text-sm font-semibold text-[#e6edf3]">Replication Service Offline</p>
            <p className="text-xs text-[#7d8590] mt-1 mb-3">Backend telemetry endpoint is unreachable.</p>
            <button
              onClick={() => refreshAll()}
              className="px-3 py-1.5 rounded bg-rose-600/20 hover:bg-rose-600/30 border border-rose-600/40 text-rose-200 text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Connection
            </button>
          </div>
        ) : replicas.length === 0 ? (
          <div className="py-12 text-center text-[#7d8590]">
            {isLoading ? (
              <>
                <RefreshCw className="w-7 h-7 mx-auto mb-2 text-blue-400 animate-spin" />
                <p className="text-sm font-semibold text-[#e6edf3]">Fetching replication stream...</p>
              </>
            ) : (
              <>
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No follower replicas currently registered in the replication stream.</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Replica lag and queue metrics">
              <thead>
                <tr className="border-b border-[#30363d] text-[#7d8590] uppercase tracking-wider bg-[#0d1117]/40">
                  <th scope="col" className="py-2.5 px-3 font-medium">Replica</th>
                  <th scope="col" className="py-2.5 px-3 font-medium">Status</th>
                  <th scope="col" className="py-2.5 px-3 font-medium">Replication Progress</th>
                  <th scope="col" className="py-2.5 px-3 font-medium">Primary LSN</th>
                  <th scope="col" className="py-2.5 px-3 font-medium">Applied LSN</th>
                  <th scope="col" className="py-2.5 px-3 font-medium">Sync State</th>
                  <th scope="col" className="py-2.5 px-3 font-medium">Configured Delay</th>
                  <th scope="col" className="py-2.5 px-3 font-medium">Pending Queue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {replicas.map((replica) => {
                  const syncPct = replica.sync_percentage ?? (primaryLsn === 0 ? 100 : Math.min(100, Math.round((replica.applied_lsn / primaryLsn) * 100)))
                  const isDown = replica.status === 'DOWN' || replica.status === 'ISOLATED'

                  return (
                    <tr key={replica.node_id} className="hover:bg-[#1c2128]/50 transition-colors">
                      <td className="py-3 px-3 font-medium text-[#e6edf3]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{replica.node_id}</span>
                          <span className="text-[#7d8590] font-normal">({replica.name})</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={replica.status} />
                      </td>
                      <td className="py-3 px-3 min-w-[150px]">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-mono font-semibold text-[#e6edf3]">{syncPct}%</span>
                          <span className="font-mono text-[#7d8590] text-[10px]">
                            {replica.applied_lsn} / {primaryLsn}
                          </span>
                        </div>
                        <div className="w-full bg-[#21262d] rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 rounded-full ${
                              isDown
                                ? 'bg-rose-600'
                                : replica.lag_lsn === 0
                                ? 'bg-emerald-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${isDown ? 100 : syncPct}%` }}
                          />
                        </div>
                        {isDown && (
                          <span className="text-[10px] text-rose-400 font-medium block mt-0.5">Stream severed (offline)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#7d8590]">{primaryLsn}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-[#e6edf3]">
                        {replica.applied_lsn}
                      </td>
                      <td className="py-3 px-3">
                        {isDown ? (
                          <span className="inline-flex items-center font-mono text-[11px] text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/50">
                            Disconnected
                          </span>
                        ) : replica.lag_lsn === 0 ? (
                          <span className="inline-flex items-center font-mono font-semibold text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-800/40 text-[11px]">
                            ✓ Caught Up
                          </span>
                        ) : (
                          <span className="inline-flex items-center font-mono font-semibold text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/40 text-[11px]">
                            -{replica.lag_lsn} LSN
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-[#7d8590]">
                        {replica.configured_delay_ms} ms
                      </td>
                      <td className="py-3 px-3 font-mono text-[#7d8590]">
                        {replica.pending_queue_count}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
