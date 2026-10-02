import React from 'react'
import {
  Activity,
  Layers,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Server,
  WifiOff,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { StatCard } from '../components/StatCard'
import { SectionHeader } from '../components/SectionHeader'
import { ClusterTopology } from '../components/ClusterTopology'
import { NodeHealthSummary } from '../components/NodeHealthSummary'
import { ClusterTelemetryCard } from '../components/ClusterTelemetryCard'
import { useCluster } from '../hooks/useCluster'
import type { PageId } from '../types'

interface OverviewPageProps {
  onNavigate?: (page: PageId) => void
}


export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigate }) => {
  const { cluster, replication, events, isBackendConnected, isLoading } = useCluster()

  const nodes = cluster?.nodes ?? []
  const replicaNodes = nodes.filter((n) => n.role === 'REPLICA')

  // Find replica with maximum lag records
  let maxLag = 0
  let maxLagNode: (typeof nodes)[0] | null = null
  for (const replica of replicaNodes) {
    if (replica.replication_lag_records > maxLag) {
      maxLag = replica.replication_lag_records
      maxLagNode = replica
    }
  }

  const hasLag = maxLag > 0
  const isHealthy = cluster?.is_healthy ?? false
  const primaryLsn = cluster?.current_primary_lsn ?? 0

  // Real chart data computed from current nodes
  const chartData = nodes.map((node) => ({
    name: `${node.id} (${node.role === 'PRIMARY' ? 'P' : node.role === 'REPLICA' ? 'R' : 'S'})`,
    appliedLsn: node.last_applied_lsn,
    lagRecords: node.replication_lag_records,
  }))

  const totalPendingLag = replicaNodes.reduce(
    (acc, curr) => acc + curr.replication_lag_records,
    0
  )

  const recentEvents = events.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <SectionHeader
        title="Cluster Overview"
        description="High-availability replication state, node topology, and WAL log sequence numbers."
        action={
          <div className="flex items-center gap-2">
            {!isBackendConnected ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-medium">
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                Backend Offline
              </span>
            ) : isHealthy ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                All Systems Operational
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/50 border border-amber-800/60 text-amber-300 text-xs font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Cluster Degraded
              </span>
            )}
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Cluster Health"
          value={
            !isBackendConnected
              ? 'DISCONNECTED'
              : isHealthy
              ? 'HEALTHY'
              : 'DEGRADED'
          }
          icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
          description={
            cluster
              ? `Epoch ${cluster.current_epoch} • Auto-Failover: ${
                  cluster.auto_failover_enabled ? 'Enabled' : 'Disabled'
                }`
              : 'Waiting for telemetry...'
          }
          trend={
            !isBackendConnected
              ? 'No Link'
              : isHealthy
              ? 'Quorum OK'
              : 'Attention'
          }
          trendColor={
            !isBackendConnected ? 'danger' : isHealthy ? 'success' : 'warning'
          }
        />

        <StatCard
          title="Primary Leader"
          value={
            cluster?.primary_node_id
              ? cluster.primary_node_id
              : isBackendConnected
              ? 'None (Electing)'
              : '—'
          }
          icon={<Server className="w-4 h-4 text-blue-400" />}
          description={
            cluster
              ? `Current Primary LSN: ${cluster.current_primary_lsn}`
              : 'Telemetry unavailable'
          }
          trend={cluster ? `Epoch ${cluster.current_epoch}` : '—'}
          trendColor="neutral"
        />

        <StatCard
          title="Replication Mode"
          value={cluster?.replication_mode ?? 'ASYNC'}
          icon={<Layers className="w-4 h-4 text-purple-400" />}
          description={`${replicaNodes.length} Active Replicas`}
          trend={!isBackendConnected ? '—' : hasLag ? 'Lagging' : 'In Sync'}
          trendColor={hasLag ? 'warning' : 'success'}
        />

        <StatCard
          title="Max Replica Lag"
          value={`${maxLag} rec`}
          icon={<Clock className="w-4 h-4 text-amber-400" />}
          description={
            maxLagNode
              ? `${maxLagNode.name} (delay: ${maxLagNode.replication_delay_ms}ms)`
              : 'All replicas caught up'
          }
          trend={
            maxLagNode ? `+${maxLagNode.replication_delay_ms}ms` : '0ms'
          }
          trendColor={hasLag ? 'warning' : 'success'}
        />
      </div>

      {/* ── Node Fleet Health & Cluster Telemetry (Stage 4D) ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NodeHealthSummary
          nodes={nodes}
          isBackendConnected={isBackendConnected}
          autoFailover={cluster?.auto_failover_enabled}
          epoch={cluster?.current_epoch}
        />
        <ClusterTelemetryCard
          cluster={cluster}
          replication={replication}
          isBackendConnected={isBackendConnected}
        />
      </div>

      {/* ── Live Cluster Topology ───────────────────────────────────────────── */}
      <ClusterTopology
        cluster={cluster}
        replication={replication}
        isLoading={isLoading}
        isBackendConnected={isBackendConnected}
        title="Live Cluster Topology"
      />

      {/* ── LSN Sync Chart ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#e6edf3]">LSN Sync Alignment</h3>
            <p className="text-xs text-[#7d8590] mt-0.5">Applied Log Sequence Number vs Replication Lag per node</p>
          </div>
          <Activity className="w-4 h-4 text-[#7d8590]" />
        </div>

        <div className="h-52 w-full">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[#7d8590]">
              No node sync data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#7d8590"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#30363d' }}
                />
                <YAxis
                  stroke="#7d8590"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#30363d' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    borderColor: '#30363d',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#e6edf3',
                  }}
                />
                <Bar dataKey="appliedLsn" fill="#58a6ff" name="Applied LSN" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lagRecords" fill="#d29922" name="Lag (Records)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-[#30363d] text-xs text-[#7d8590] flex items-center justify-between">
          <span>Primary WAL Head: LSN {primaryLsn}</span>
          <span
            className={`font-mono ${
              totalPendingLag > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {totalPendingLag} pending commits
          </span>
        </div>
      </div>


      {/* Recent Audit Events Section */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#e6edf3]">Recent System Audit Trail</h3>
            <p className="text-xs text-[#7d8590] mt-0.5">Real-time replication and failover event dispatch</p>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('events')}
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1 transition-colors"
            >
              View all logs <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          {recentEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#7d8590]">
              No audit events logged yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#30363d] text-[#7d8590] uppercase tracking-wider">
                  <th className="py-2.5 px-3 font-medium">Timestamp</th>
                  <th className="py-2.5 px-3 font-medium">Event Type</th>
                  <th className="py-2.5 px-3 font-medium">Node</th>
                  <th className="py-2.5 px-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {recentEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-[#1c2128]/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[#7d8590] whitespace-nowrap">
                      {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '—'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-[#0d1117] border border-[#30363d] text-blue-300">
                        {event.event_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#e6edf3]">
                      {event.source_node || 'CLUSTER'}
                    </td>
                    <td className="py-2.5 px-3 text-[#7d8590]">
                      {event.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
