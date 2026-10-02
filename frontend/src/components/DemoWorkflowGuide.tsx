import React, { useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, ShieldCheck, Zap, AlertTriangle, Play, RefreshCw, Database } from 'lucide-react'

export const DemoWorkflowGuide: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(true)

  const steps = [
    {
      step: '1',
      title: 'Write Initial Record',
      icon: <Database className="w-3.5 h-3.5 text-blue-400" />,
      desc: 'Use Write Pipeline Test to write a key-value record to the Primary. Observe WAL LSN progression on the Replication page.',
    },
    {
      step: '2',
      title: 'Inject Follower Delay',
      icon: <Zap className="w-3.5 h-3.5 text-amber-400" />,
      desc: 'Set artificial delay (e.g. 1500ms) on replica-2. Write another record and query replica-2 using Read Test to observe eventual consistency (stale read until caught up).',
    },
    {
      step: '3',
      title: 'Simulate Primary Outage',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
      desc: 'Select the primary node and click "Simulate Outage". Confirm the destructive action.',
    },
    {
      step: '4',
      title: 'Watch Watchdog Detection',
      icon: <RefreshCw className="w-3.5 h-3.5 text-amber-400" />,
      desc: 'Observe missed heartbeats in the Lifecycle Event Stream. After 3 missed heartbeats, watchdog declares PRIMARY_FAILED.',
    },
    {
      step: '5',
      title: 'Observe Automatic Promotion',
      icon: <Play className="w-3.5 h-3.5 text-purple-400" />,
      desc: 'The replica with the highest LSN is elected and promoted to PRIMARY. The leadership epoch increments (e.g. Epoch 1 -> 2).',
    },
    {
      step: '6',
      title: 'Verify Epoch Fencing (Split-Brain Prevention)',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />,
      desc: 'The demoted former primary is marked fenced. Test writing directly to it in the Write Pipeline to see HTTP 409 Conflict rejection.',
    },
    {
      step: '7',
      title: 'Recover Former Primary',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />,
      desc: 'Select the former primary and click "Recover Node". Verify it rejoins safely as a follower without stealing leadership.',
    },
  ]

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-[#e6edf3]">
            Operator Runbook: High-Availability Failover Walkthrough
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-950/40 border border-blue-800/50 text-blue-300">
            Instructional Guide
          </span>
        </div>
        <button
          className="text-[#7d8590] hover:text-[#e6edf3] p-1 rounded"
          aria-label={isOpen ? 'Collapse runbook' : 'Expand runbook'}
        >
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-[#21262d] space-y-3">
          <p className="text-xs text-[#7d8590]">
            Follow this 7-step sequence using the live controls below to demonstrate Replicore's heartbeat detection, failover promotion, split-brain fencing, and monotonic LSN recovery.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 pt-1">
            {steps.map((s) => (
              <div
                key={s.step}
                className="p-3 rounded-md bg-[#0d1117] border border-[#30363d] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-[#21262d] border border-[#30363d] text-[11px] font-bold font-mono text-[#e6edf3] flex items-center justify-center shrink-0">
                      {s.step}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#e6edf3]">
                      {s.icon}
                      <span>{s.title}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#7d8590] leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
