import React, { useState } from 'react'
import { Filter } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import type { AuditEvent } from '../types'

const MOCK_EVENTS: AuditEvent[] = [
  {
    id: 'evt-101',
    timestamp: '23:10:02.145',
    event_type: 'WRITE_RECORD',
    source_node: 'node-1',
    description: 'Committed key "user:session:104" at LSN 42',
    details: { key: 'user:session:104', lsn: 42, epoch: 1 },
  },
  {
    id: 'evt-102',
    timestamp: '23:09:45.320',
    event_type: 'WRITE_RECORD',
    source_node: 'node-1',
    description: 'Committed key "config:cache_ttl" at LSN 41',
    details: { key: 'config:cache_ttl', lsn: 41, epoch: 1 },
  },
  {
    id: 'evt-103',
    timestamp: '23:08:12.890',
    event_type: 'REPLICATION_DELAY_UPDATED',
    source_node: 'node-3',
    description: 'Configured artificial delay of 200ms on node-3',
    details: { delay_ms: 200, target_node: 'node-3' },
  },
  {
    id: 'evt-104',
    timestamp: '23:05:00.000',
    event_type: 'CLUSTER_STARTUP',
    source_node: null,
    description: 'Cluster topology initialized with 3 nodes. Leader elected: node-1 (Epoch 1)',
    details: { epoch: 1, primary: 'node-1', total_nodes: 3 },
  },
]

export const EventLogsPage: React.FC = () => {
  const [filterType, setFilterType] = useState<string>('ALL')

  return (
    <div className="space-y-6">
      <SectionHeader
        title="System Audit Logs"
        description="Chronological audit history of cluster transitions, write operations, watchdog detections, and failover events."
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#7d8590] bg-[#161b22] px-3 py-1.5 rounded border border-[#30363d]">
              Total Events: <span className="text-[#e6edf3] font-semibold">{MOCK_EVENTS.length}</span>
            </span>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg border border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2 text-xs text-[#7d8590]">
          <Filter className="w-4 h-4 text-[#7d8590]" />
          <span>Filter Type:</span>
          {['ALL', 'WRITES', 'FAILOVER', 'TOPOLOGY'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterType(tab)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filterType === tab
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'text-[#7d8590] hover:text-[#e6edf3]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="text-xs text-[#7d8590] font-mono">
          Showing latest events (limit: 50)
        </div>
      </div>

      <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#30363d] text-[#7d8590] uppercase tracking-wider bg-[#0d1117]/50">
              <th className="py-3 px-4 font-medium">Timestamp</th>
              <th className="py-3 px-4 font-medium">Event Type</th>
              <th className="py-3 px-4 font-medium">Source Node</th>
              <th className="py-3 px-4 font-medium">Description</th>
              <th className="py-3 px-4 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#21262d]">
            {MOCK_EVENTS.map((event) => (
              <tr key={event.id} className="hover:bg-[#1c2128]/50 transition-colors">
                <td className="py-3 px-4 font-mono text-[#7d8590] whitespace-nowrap">
                  {event.timestamp}
                </td>
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-[#0d1117] border border-[#30363d] text-blue-300">
                    {event.event_type}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-[#e6edf3]">
                  {event.source_node || 'SYSTEM'}
                </td>
                <td className="py-3 px-4 text-[#e6edf3]">
                  {event.description}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-[#7d8590]">
                  {JSON.stringify(event.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
