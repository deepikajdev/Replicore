import React from 'react'
import { RefreshCw, GitCommit, Layers } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { StatCard } from '../components/StatCard'
import { StatusBadge } from '../components/StatusBadge'
import type { ReplicaLagInfo } from '../types'

const MOCK_REPLICAS: ReplicaLagInfo[] = [
  {
    node_id: 'node-2',
    name: 'Replica Node 2',
    role: 'REPLICA',
    status: 'HEALTHY',
    applied_lsn: 42,
    lag_lsn: 0,
    configured_delay_ms: 0,
    pending_queue_count: 0,
  },
  {
    node_id: 'node-3',
    name: 'Replica Node 3',
    role: 'REPLICA',
    status: 'HEALTHY',
    applied_lsn: 40,
    lag_lsn: 2,
    configured_delay_ms: 200,
    pending_queue_count: 2,
  },
]

export const ReplicationPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Replication Stream & Lag"
        description="Write-Ahead Log (WAL) transmission status, replica log sequence numbers, and artificial delay controls."
        action={
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-blue-950/50 border border-blue-800/60 text-blue-300 text-xs font-mono font-medium">
              Primary WAL Head: LSN 42
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Replication Protocol"
          value="ASYNC"
          icon={<Layers className="w-4 h-4 text-purple-400" />}
          description="Non-blocking WAL stream"
          trend="Real-time"
          trendColor="success"
        />
        <StatCard
          title="Primary Commit Head"
          value="LSN 42"
          icon={<GitCommit className="w-4 h-4 text-blue-400" />}
          description="Log sequence offset 42"
          trend="Monotonic"
          trendColor="neutral"
        />
        <StatCard
          title="Max Replicas Lag"
          value="2 LSN"
          icon={<RefreshCw className="w-4 h-4 text-amber-400" />}
          description="Delayed by 200ms on node-3"
          trend="node-3"
          trendColor="warning"
        />
      </div>

      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">Replica Lag & Queue Metrics</h3>

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
              {MOCK_REPLICAS.map((replica) => (
                <tr key={replica.node_id} className="hover:bg-[#1c2128]/50">
                  <td className="py-3 px-3 font-medium text-[#e6edf3]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{replica.node_id}</span>
                      <span className="text-[#7d8590] font-normal">({replica.name})</span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={replica.status} />
                  </td>
                  <td className="py-3 px-3 font-mono text-[#7d8590]">42</td>
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
      </div>
    </div>
  )
}
