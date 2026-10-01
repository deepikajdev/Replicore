import React, { useState } from 'react'
import {
  Zap,
  AlertTriangle,
  Play,
  Sliders,
  ShieldAlert,
  Send,
  CheckCircle,
} from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'

export const SimulationPage: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState('node-1')
  const [delayMs, setDelayMs] = useState(200)
  const [writeKey, setWriteKey] = useState('user:101')
  const [writeValue, setWriteValue] = useState('{"active": true}')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const handleSimulateAction = (actionName: string) => {
    setStatusMessage(`Action simulated: ${actionName} (Frontend mock preview - connects in next step)`)
    setTimeout(() => setStatusMessage(null), 4000)
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Failover & Outage Simulator"
        description="Inject chaos scenarios, simulate node failure / network partitions, trigger failovers, and test epoch fencing."
        action={
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-amber-950/50 border border-amber-800/60 text-amber-300 text-xs font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Simulation Controls Active
            </span>
          </div>
        }
      />

      {statusMessage && (
        <div className="p-3 rounded-lg bg-blue-950/50 border border-blue-800/60 text-blue-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-blue-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Grid of Simulation Scenarios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Node Outage Simulation */}
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#e6edf3] font-semibold text-sm mb-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <h3>Node Outage Injection</h3>
            </div>
            <p className="text-xs text-[#7d8590] mb-4">
              Mark a node as unavailable. Watchdog triggers missed heartbeats until threshold is met.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#7d8590] block mb-1">Target Node</label>
                <select
                  value={selectedNode}
                  onChange={(e) => setSelectedNode(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] focus:border-blue-500 focus:outline-none"
                >
                  <option value="node-1">node-1 (Current Primary)</option>
                  <option value="node-2">node-2 (Replica)</option>
                  <option value="node-3">node-3 (Replica)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <button
              onClick={() => handleSimulateAction(`Fail ${selectedNode}`)}
              className="flex-1 py-1.5 px-3 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 text-xs font-medium transition-colors"
            >
              Simulate Failure
            </button>
            <button
              onClick={() => handleSimulateAction(`Recover ${selectedNode}`)}
              className="py-1.5 px-3 rounded bg-[#1c2128] hover:bg-[#21262d] text-[#e6edf3] border border-[#30363d] text-xs font-medium transition-colors"
            >
              Recover
            </button>
          </div>
        </div>

        {/* Card 2: Failover & Promotion */}
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#e6edf3] font-semibold text-sm mb-2">
              <ShieldAlert className="w-4 h-4 text-purple-400" />
              <h3>Replica Promotion & Epoch Fencing</h3>
            </div>
            <p className="text-xs text-[#7d8590] mb-4">
              Promote most up-to-date replica, increment epoch, and fence old primary to prevent split-brain.
            </p>

            <div className="space-y-2 text-xs text-[#7d8590]">
              <div className="flex items-center justify-between p-2 rounded bg-[#0d1117] border border-[#21262d]">
                <span>Current Leadership:</span>
                <span className="font-mono text-[#e6edf3]">Epoch 1 (node-1)</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-[#0d1117] border border-[#21262d]">
                <span>Next Epoch:</span>
                <span className="font-mono text-purple-400">Epoch 2</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => handleSimulateAction('Manual Failover Promotion')}
            className="w-full mt-6 py-2 px-3 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-600/40 text-xs font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Play className="w-3.5 h-3.5" />
            Trigger Failover Promotion
          </button>
        </div>

        {/* Card 3: Replication Delay Tuner */}
        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#e6edf3] font-semibold text-sm mb-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h3>Replication Lag Tuner</h3>
            </div>
            <p className="text-xs text-[#7d8590] mb-4">
              Inject artificial latency onto replica node-3 to test lag detection and promotion selection.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#7d8590]">Latency Delay:</span>
                <span className="font-mono text-[#e6edf3] font-semibold">{delayMs} ms</span>
              </div>
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={() => handleSimulateAction(`Set node-3 delay to ${delayMs}ms`)}
            className="w-full mt-6 py-1.5 px-3 rounded bg-[#1c2128] hover:bg-[#21262d] text-[#e6edf3] border border-[#30363d] text-xs font-medium transition-colors"
          >
            Apply Delay ({delayMs}ms)
          </button>
        </div>
      </div>

      {/* Write Ingestion Simulator */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
        <h3 className="text-sm font-semibold text-[#e6edf3] mb-1">Write Pipeline Test</h3>
        <p className="text-xs text-[#7d8590] mb-4">
          Send test records to verify replication propagation, WAL monotonic ordering, or fenced node rejection (409 Conflict).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs text-[#7d8590] block mb-1">Record Key</label>
            <input
              type="text"
              value={writeKey}
              onChange={(e) => setWriteKey(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-[#7d8590] block mb-1">Record Value</label>
            <input
              type="text"
              value={writeValue}
              onChange={(e) => setWriteValue(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={() => handleSimulateAction(`Commit write "${writeKey}"`)}
          className="py-1.5 px-4 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center gap-2"
        >
          <Send className="w-3.5 h-3.5" />
          Submit Write to Primary
        </button>
      </div>
    </div>
  )
}
