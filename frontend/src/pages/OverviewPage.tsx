import React from 'react'
import {
  Server,
  Activity,
  Layers,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
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
import { StatusBadge } from '../components/StatusBadge'
import { SectionHeader } from '../components/SectionHeader'
import type { NodeInfo, AuditEvent } from '../types'

// Realistic placeholder data matching our 3-node cluster architecture
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

const MOCK_EVENTS: AuditEvent[] = [
  {
    id: 'evt-01',
    timestamp: '23:10:02',
    event_type: 'WRITE_RECORD',
    source_node: 'node-1',
    description: 'Committed key "user:session:104" at LSN 42',
    details: { key: 'user:session:104', lsn: 42 },
  },
  {
    id: 'evt-02',
    timestamp: '23:09:45',
    event_type: 'WRITE_RECORD',
    source_node: 'node-1',
    description: 'Committed key "config:cache_ttl" at LSN 41',
    details: { key: 'config:cache_ttl', lsn: 41 },
  },
  {
    id: 'evt-03',
    timestamp: '23:08:12',
    event_type: 'REPLICATION_DELAY_UPDATED',
    source_node: 'node-3',
    description: 'Configured artificial delay of 200ms on node-3',
    details: { delay_ms: 200 },
  },
  {
    id: 'evt-04',
    timestamp: '23:05:00',
    event_type: 'CLUSTER_STARTUP',
    source_node: null,
    description: 'Cluster topology initialized with 3 nodes. Leader elected: node-1 (Epoch 1)',
    details: { epoch: 1, primary: 'node-1' },
  },
]

const CHART_DATA = [
  { name: 'node-1 (P)', appliedLsn: 42, lagRecords: 0 },
  { name: 'node-2 (R1)', appliedLsn: 42, lagRecords: 0 },
  { name: 'node-3 (R2)', appliedLsn: 40, lagRecords: 2 },
]

export const OverviewPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <SectionHeader
        title="Cluster Overview"
        description="High-availability replication state, node topology, and WAL log sequence numbers."
        action={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              All Systems Operational
            </span>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Cluster Health"
          value="HEALTHY"
          icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
          description="Epoch 1 • Auto-Failover: Enabled"
          trend="Quorum OK"
          trendColor="success"
        />

        <StatCard
          title="Primary Leader"
          value="node-1"
          icon={<Server className="w-4 h-4 text-blue-400" />}
          description="Current Primary LSN: 42"
          trend="Epoch 1"
          trendColor="neutral"
        />

        <StatCard
          title="Replication Mode"
          value="ASYNC"
          icon={<Layers className="w-4 h-4 text-purple-400" />}
          description="2 Active Replicas"
          trend="In Sync"
          trendColor="success"
        />

        <StatCard
          title="Max Replica Lag"
          value="2 rec"
          icon={<Clock className="w-4 h-4 text-amber-400" />}
          description="node-3 (delay: 200ms)"
          trend="+200ms"
          trendColor="warning"
        />
      </div>

      {/* Main Grid: Nodes Cards + Replication Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Cluster Topology Cards (2 cols on desktop) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#e6edf3] uppercase tracking-wide">
              Topology Nodes ({MOCK_NODES.length})
            </h2>
            <span className="text-xs text-[#7d8590]">Heartbeat frequency: 1000ms</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {MOCK_NODES.map((node) => {
              const isPrimary = node.role === 'PRIMARY'
              return (
                <div
                  key={node.id}
                  className={`rounded-lg border bg-[#161b22] p-4 transition-all duration-150 ${
                    isPrimary
                      ? 'border-blue-500/40 bg-gradient-to-r from-blue-950/10 via-[#161b22] to-[#161b22]'
                      : 'border-[#30363d] hover:border-[#484f58]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-md flex items-center justify-center font-mono font-bold text-sm border ${
                          isPrimary
                            ? 'bg-blue-950/60 border-blue-600/60 text-blue-300'
                            : 'bg-[#1c2128] border-[#30363d] text-[#e6edf3]'
                        }`}
                      >
                        {node.id.replace('node-', 'N')}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[#e6edf3]">{node.name}</span>
                          <StatusBadge role={node.role} />
                          <StatusBadge status={node.status} />
                          {node.is_fenced && <StatusBadge isFenced />}
                        </div>
                        <div className="text-xs text-[#7d8590] font-mono mt-0.5">
                          {node.endpoint_url} • Epoch {node.leadership_epoch}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-xs text-right sm:border-l sm:border-[#30363d] sm:pl-6">
                      <div>
                        <div className="text-[#7d8590]">Applied LSN</div>
                        <div className="font-mono font-semibold text-[#e6edf3] text-sm">
                          {node.last_applied_lsn}
                        </div>
                      </div>

                      <div>
                        <div className="text-[#7d8590]">Lag</div>
                        <div
                          className={`font-mono font-semibold text-sm ${
                            node.replication_lag_records > 0
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {node.replication_lag_records} rec
                        </div>
                      </div>

                      <div>
                        <div className="text-[#7d8590]">Delay</div>
                        <div className="font-mono text-[#7d8590] text-sm">
                          {node.replication_delay_ms}ms
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: LSN / Lag Visualization */}
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#e6edf3]">LSN Sync Alignment</h3>
                <p className="text-xs text-[#7d8590] mt-0.5">Applied Log Sequence Number vs Lag</p>
              </div>
              <Activity className="w-4 h-4 text-[#7d8590]" />
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={CHART_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#30363d] text-xs text-[#7d8590] flex items-center justify-between">
            <span>Primary Wal Head: LSN 42</span>
            <span className="text-emerald-400 font-mono">0 pending commits</span>
          </div>
        </div>
      </div>

      {/* Recent Audit Events Section */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#e6edf3]">Recent System Audit Trail</h3>
            <p className="text-xs text-[#7d8590] mt-0.5">Real-time replication and failover event dispatch</p>
          </div>
          <span className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1">
            View all logs <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="overflow-x-auto">
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
              {MOCK_EVENTS.map((event) => (
                <tr key={event.id} className="hover:bg-[#1c2128]/50 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-[#7d8590] whitespace-nowrap">
                    {event.timestamp}
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
        </div>
      </div>
    </div>
  )
}
