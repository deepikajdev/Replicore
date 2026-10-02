import React from 'react'
import { ShieldAlert, Clock, Radio } from 'lucide-react'
import type { AuditEvent, AuditEventType } from '../types'

interface FailoverEventTimelineProps {
  events: AuditEvent[]
  limit?: number
}

const FAILOVER_EVENT_TYPES: AuditEventType[] = [
  'HEARTBEAT_MISSED',
  'NODE_OUTAGE_SIMULATED',
  'NODE_HEALTH_CHANGED',
  'PRIMARY_FAILED',
  'FAILOVER_TRIGGERED',
  'FAILOVER_STARTED',
  'REPLICA_SELECTED',
  'NODE_PROMOTED',
  'EPOCH_INCREMENTED',
  'OLD_PRIMARY_FENCED',
  'FENCED_WRITE_REJECTED',
  'NODE_RECOVERED',
]

const getEventBadgeStyle = (type: AuditEventType): string => {
  switch (type) {
    case 'PRIMARY_FAILED':
    case 'NODE_OUTAGE_SIMULATED':
    case 'OLD_PRIMARY_FENCED':
    case 'FENCED_WRITE_REJECTED':
      return 'bg-rose-950/50 border-rose-800/60 text-rose-300'
    case 'FAILOVER_TRIGGERED':
    case 'FAILOVER_STARTED':
    case 'HEARTBEAT_MISSED':
    case 'NODE_HEALTH_CHANGED':
      return 'bg-amber-950/50 border-amber-800/60 text-amber-300'
    case 'NODE_PROMOTED':
    case 'EPOCH_INCREMENTED':
      return 'bg-purple-950/50 border-purple-800/60 text-purple-300'
    case 'NODE_RECOVERED':
    case 'REPLICA_SELECTED':
      return 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
    default:
      return 'bg-[#0d1117] border-[#30363d] text-[#7d8590]'
  }
}

export const FailoverEventTimeline: React.FC<FailoverEventTimelineProps> = ({
  events,
  limit = 10,
}) => {
  const failoverEvents = events
    .filter((e) => FAILOVER_EVENT_TYPES.includes(e.event_type))
    .slice(0, limit)

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">
              Failover & Lifecycle Event Stream
            </h3>
          </div>
          <p className="text-xs text-[#7d8590] mt-0.5">
            Real backend audit events tracking heartbeat watchdog, promotions, epochs, and fencing
          </p>
        </div>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-[#0d1117] border border-[#30363d] text-[#7d8590]">
          <Clock className="w-3 h-3 text-[#7d8590]" />
          {failoverEvents.length} events logged
        </span>
      </div>

      {failoverEvents.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#7d8590]">
          <Radio className="w-6 h-6 mx-auto mb-2 opacity-30 animate-pulse" />
          <p className="font-medium text-[#c9d1d9]">No failover or outage events recorded yet.</p>
          <p className="mt-1 text-[11px] text-[#7d8590] max-w-sm mx-auto">
            Simulate a node failure or trigger failover above to observe real audit events dispatched by the backend watchdog.
          </p>
        </div>
      ) : (
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
              {failoverEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-[#1c2128]/50 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-[#7d8590] whitespace-nowrap">
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : '—'}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold border ${getEventBadgeStyle(
                        evt.event_type
                      )}`}
                    >
                      {evt.event_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[#e6edf3]">
                    {evt.source_node || 'CLUSTER'}
                  </td>
                  <td className="py-2.5 px-3 text-[#c9d1d9]">{evt.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
