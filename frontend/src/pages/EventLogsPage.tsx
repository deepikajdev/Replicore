import React, { useState, useMemo } from 'react'
import { Filter, Inbox, Search } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { useCluster } from '../hooks/useCluster'
import type { AuditEventType } from '../types'

export const EventLogsPage: React.FC = () => {
  const { events, totalEvents, isLoading } = useCluster()
  const [filterType, setFilterType] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const getBadgeStyle = (eventType: AuditEventType) => {
    switch (eventType) {
      case 'PRIMARY_FAILED':
      case 'OLD_PRIMARY_FENCED':
      case 'FENCED_WRITE_REJECTED':
      case 'HEARTBEAT_MISSED':
      case 'NODE_OUTAGE_SIMULATED':
        return 'bg-rose-950/60 text-rose-300 border-rose-800/70'
      case 'FAILOVER_TRIGGERED':
      case 'FAILOVER_STARTED':
      case 'NODE_PROMOTED':
      case 'EPOCH_INCREMENTED':
      case 'REPLICA_SELECTED':
        return 'bg-purple-950/60 text-purple-300 border-purple-800/70'
      case 'WRITE_RECORD':
        return 'bg-blue-950/60 text-blue-300 border-blue-800/70'
      case 'CLUSTER_STARTUP':
      case 'NODE_RECOVERED':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/70'
      default:
        return 'bg-[#0d1117] text-[#7d8590] border-[#30363d]'
    }
  }

  const filteredEvents = useMemo(() => {
    let result = events

    if (filterType === 'WRITES') {
      result = result.filter((e) => e.event_type === 'WRITE_RECORD')
    } else if (filterType === 'FAILOVER') {
      const failoverTypes = [
        'FAILOVER_TRIGGERED',
        'FAILOVER_STARTED',
        'NODE_PROMOTED',
        'REPLICA_SELECTED',
        'EPOCH_INCREMENTED',
        'OLD_PRIMARY_FENCED',
        'FENCED_WRITE_REJECTED',
        'PRIMARY_FAILED',
      ]
      result = result.filter((e) => failoverTypes.includes(e.event_type))
    } else if (filterType === 'TOPOLOGY') {
      const topologyTypes = [
        'CLUSTER_STARTUP',
        'NODE_HEALTH_CHANGED',
        'HEARTBEAT_MISSED',
        'NODE_OUTAGE_SIMULATED',
        'NODE_RECOVERED',
        'REPLICATION_DELAY_UPDATED',
        'DATA_CONSISTENCY_CHECK',
      ]
      result = result.filter((e) => topologyTypes.includes(e.event_type))
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (e) =>
          e.event_type.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.source_node && e.source_node.toLowerCase().includes(q))
      )
    }

    return result
  }, [events, filterType, searchQuery])

  return (
    <div className="space-y-6">
      <SectionHeader
        title="System Audit Logs"
        description="Chronological audit history of cluster transitions, write operations, watchdog detections, and failover events."
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#7d8590] bg-[#161b22] px-3 py-1.5 rounded border border-[#30363d]">
              Total Events: <span className="text-[#e6edf3] font-semibold font-mono">{totalEvents}</span>
            </span>
          </div>
        }
      />

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-lg border border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2 text-xs text-[#7d8590] flex-wrap">
          <Filter className="w-4 h-4 text-[#7d8590]" aria-hidden="true" />
          <span>Category:</span>
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

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-[#7d8590] absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search events, nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded bg-[#0d1117] border border-[#30363d] text-xs text-[#e6edf3] placeholder-[#7d8590] focus:border-blue-500 focus:outline-none"
              aria-label="Filter events by search query"
            />
          </div>
          <div className="text-xs text-[#7d8590] font-mono shrink-0">
            Showing {filteredEvents.length} of {totalEvents}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="py-16 text-center text-[#7d8590]">
            <Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-[#e6edf3]">
              {isLoading ? 'Loading audit trail...' : 'No audit events found'}
            </p>
            <p className="text-xs text-[#7d8590] mt-1">
              {filterType === 'ALL' && !searchQuery
                ? 'No cluster events have been recorded yet.'
                : 'No events matched your current filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="System audit log table">
              <thead>
                <tr className="border-b border-[#30363d] text-[#7d8590] uppercase tracking-wider bg-[#0d1117]/50">
                  <th scope="col" className="py-3 px-4 font-medium">Timestamp</th>
                  <th scope="col" className="py-3 px-4 font-medium">Event Type</th>
                  <th scope="col" className="py-3 px-4 font-medium">Source Node</th>
                  <th scope="col" className="py-3 px-4 font-medium">Description</th>
                  <th scope="col" className="py-3 px-4 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-[#1c2128]/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-[#7d8590] whitespace-nowrap">
                      {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold border ${getBadgeStyle(event.event_type)}`}>
                        {event.event_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-[#e6edf3]">
                      {event.source_node || 'SYSTEM'}
                    </td>
                    <td className="py-3 px-4 text-[#e6edf3]">
                      {event.description}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#7d8590] max-w-xs truncate" title={JSON.stringify(event.details, null, 2)}>
                      {event.details && Object.keys(event.details).length > 0
                        ? JSON.stringify(event.details)
                        : '—'}
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
