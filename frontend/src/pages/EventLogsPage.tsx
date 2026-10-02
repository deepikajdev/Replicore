import React, { useState, useMemo } from 'react'
import { Filter, Inbox } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { useCluster } from '../hooks/useCluster'

export const EventLogsPage: React.FC = () => {
  const { events, totalEvents, isLoading } = useCluster()
  const [filterType, setFilterType] = useState<string>('ALL')

  const filteredEvents = useMemo(() => {
    if (filterType === 'ALL') return events
    if (filterType === 'WRITES') {
      return events.filter((e) => e.event_type === 'WRITE_RECORD')
    }
    if (filterType === 'FAILOVER') {
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
      return events.filter((e) => failoverTypes.includes(e.event_type))
    }
    if (filterType === 'TOPOLOGY') {
      const topologyTypes = [
        'CLUSTER_STARTUP',
        'NODE_HEALTH_CHANGED',
        'HEARTBEAT_MISSED',
        'NODE_OUTAGE_SIMULATED',
        'NODE_RECOVERED',
        'REPLICATION_DELAY_UPDATED',
        'DATA_CONSISTENCY_CHECK',
      ]
      return events.filter((e) => topologyTypes.includes(e.event_type))
    }
    return events
  }, [events, filterType])

  return (
    <div className="space-y-6">
      <SectionHeader
        title="System Audit Logs"
        description="Chronological audit history of cluster transitions, write operations, watchdog detections, and failover events."
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#7d8590] bg-[#161b22] px-3 py-1.5 rounded border border-[#30363d]">
              Total Events: <span className="text-[#e6edf3] font-semibold">{totalEvents}</span>
            </span>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg border border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2 text-xs text-[#7d8590] flex-wrap">
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
          Showing {filteredEvents.length} of {totalEvents} events
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
              {filterType === 'ALL'
                ? 'No cluster events have been recorded yet.'
                : `No events matched the "${filterType}" filter.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                {filteredEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-[#1c2128]/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-[#7d8590] whitespace-nowrap">
                      {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '—'}
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
