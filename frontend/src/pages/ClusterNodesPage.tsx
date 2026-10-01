import React from 'react'
import { Server, ShieldCheck, Heart } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { StatusBadge } from '../components/StatusBadge'
import { StatCard } from '../components/StatCard'
import type { NodeInfo } from '../types'

const MOCK_NODES: NodeInfo[] = [
  {
    id: 'node-1',
    name: 'Primary Node 1',
    role: 'PRIMARY',
    status: 'HEALTHY',
    replication_delay_ms: 0,
    last_applied_lsn: 42,
    replication_lag_records: 0,
    endpoint_url: 'http://localhost:8001',
    metrics: {
      total_writes: 42,
      total_reads: 128,
      last_ping_latency_ms: 0.8,
      consecutive_failed_heartbeats: 0,
    },
    last_heartbeat: new Date().toISOString(),
    leadership_epoch: 1,
    is_fenced: false,
  },
  {
    id: 'node-2',
    name: 'Replica Node 2',
    role: 'REPLICA',
    status: 'HEALTHY',
    replication_delay_ms: 0,
    last_applied_lsn: 42,
    replication_lag_records: 0,
    endpoint_url: 'http://localhost:8002',
    metrics: {
      total_writes: 0,
      total_reads: 89,
      last_ping_latency_ms: 1.2,
      consecutive_failed_heartbeats: 0,
    },
    last_heartbeat: new Date().toISOString(),
    leadership_epoch: 1,
    is_fenced: false,
  },
  {
    id: 'node-3',
    name: 'Replica Node 3',
    role: 'REPLICA',
    status: 'HEALTHY',
    replication_delay_ms: 200,
    last_applied_lsn: 40,
    replication_lag_records: 2,
    endpoint_url: 'http://localhost:8003',
    metrics: {
      total_writes: 0,
      total_reads: 74,
      last_ping_latency_ms: 2.1,
      consecutive_failed_heartbeats: 0,
    },
    last_heartbeat: new Date().toISOString(),
    leadership_epoch: 1,
    is_fenced: false,
  },
]

export const ClusterNodesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Cluster Nodes & Topology"
        description="Detailed node metrics, role configuration, heartbeat watchdog status, and leadership epoch tracking."
        action={
          <div className="text-xs text-[#7d8590] bg-[#161b22] px-3 py-1.5 rounded border border-[#30363d]">
            Total Nodes: <span className="text-[#e6edf3] font-semibold">3 Active</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Topology"
          value="3 Nodes"
          icon={<Server className="w-4 h-4 text-blue-400" />}
          description="1 Primary, 2 Replicas"
          trend="Quorum Valid"
          trendColor="success"
        />
        <StatCard
          title="Heartbeat Watchdog"
          value="0 Missed"
          icon={<Heart className="w-4 h-4 text-emerald-400" />}
          description="Threshold: 3 failures → DOWN"
          trend="Stable"
          trendColor="success"
        />
        <StatCard
          title="Consensus Leadership"
          value="Epoch 1"
          icon={<ShieldCheck className="w-4 h-4 text-purple-400" />}
          description="Fenced nodes: 0"
          trend="No Split-Brain"
          trendColor="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {MOCK_NODES.map((node) => (
          <div
            key={node.id}
            className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 hover:border-[#484f58] transition-colors"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-[#21262d]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-[#1c2128] border border-[#30363d] flex items-center justify-center font-mono font-bold text-sm text-[#58a6ff]">
                  {node.id}
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
                  {node.metrics.total_writes} / {node.metrics.total_reads}
                </span>
              </div>
              <div>
                <span className="text-[#7d8590] block">Ping Latency</span>
                <span className="font-mono text-sm font-semibold text-[#3fb950] mt-0.5 block">
                  {node.metrics.last_ping_latency_ms} ms
                </span>
              </div>
              <div>
                <span className="text-[#7d8590] block">Consecutive Failures</span>
                <span className="font-mono text-sm font-semibold text-[#e6edf3] mt-0.5 block">
                  {node.metrics.consecutive_failed_heartbeats} / 3
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
