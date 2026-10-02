import React, { useState } from 'react'
import {
  Zap,
  AlertTriangle,
  Play,
  Sliders,
  ShieldAlert,
  Send,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { useCluster } from '../hooks/useCluster'
import {
  simulateNodeFailure,
  simulateNodeRecovery,
  triggerFailover,
  setReplicationDelay,
  writeRecord,
} from '../services/api'
import { formatErrorMessage } from '../services/errors'

export const SimulationPage: React.FC = () => {
  const { cluster, refreshAll, isBackendConnected } = useCluster()

  const nodes = cluster?.nodes ?? []
  const primaryNode = nodes.find((n) => n.role === 'PRIMARY')
  const replicas = nodes.filter((n) => n.role === 'REPLICA')

  const [selectedNode, setSelectedNode] = useState<string>('replica-1')
  const [selectedReplicaForDelay, setSelectedReplicaForDelay] = useState<string>('replica-2')
  const [targetPromotionNode, setTargetPromotionNode] = useState<string>('replica-1')
  const [delayMs, setDelayMs] = useState<number>(500)
  const [writeKey, setWriteKey] = useState<string>('user:101')
  const [writeValue, setWriteValue] = useState<string>('{"active": true}')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type })
    setTimeout(() => {
      setStatusMessage(null)
    }, 5000)
  }

  const handleSimulateFailure = async () => {
    if (!selectedNode) return
    setIsSubmitting(true)
    try {
      const res = await simulateNodeFailure(selectedNode)
      showStatus(res.message || `Node '${selectedNode}' failure simulated successfully.`, 'success')
      await refreshAll()
    } catch (err) {
      showStatus(`Failed to simulate outage: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSimulateRecovery = async () => {
    if (!selectedNode) return
    setIsSubmitting(true)
    try {
      const res = await simulateNodeRecovery(selectedNode)
      showStatus(res.message || `Node '${selectedNode}' recovered successfully.`, 'success')
      await refreshAll()
    } catch (err) {
      showStatus(`Failed to recover node: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFailoverPromotion = async () => {
    const target = targetPromotionNode || replicas[0]?.id
    if (!target) {
      showStatus('No eligible replica available for promotion.', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await triggerFailover(target)
      showStatus(
        res.message || `Node '${res.promoted_node_id}' promoted at epoch ${res.new_epoch}.`,
        'success'
      )
      await refreshAll()
    } catch (err) {
      showStatus(`Promotion failed: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApplyDelay = async () => {
    const target = selectedReplicaForDelay || replicas[0]?.id
    if (!target) {
      showStatus('No replica available to adjust delay.', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await setReplicationDelay(target, delayMs)
      showStatus(res.message || `Updated replication delay to ${delayMs}ms.`, 'success')
      await refreshAll()
    } catch (err) {
      showStatus(`Failed to set delay: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWriteRecord = async () => {
    if (!writeKey.trim()) {
      showStatus('Key cannot be empty', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await writeRecord({ key: writeKey, value: writeValue })
      showStatus(
        `Committed key "${res.key}" at LSN ${res.lsn} (node: ${res.node_id})`,
        'success'
      )
      await refreshAll()
    } catch (err) {
      showStatus(`Write rejected: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
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
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/50 border-rose-800/60 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
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
              Mark a node as unreachable. The watchdog triggers missed heartbeats until the threshold (3) is met.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#7d8590] block mb-1">Target Node</label>
                <select
                  value={selectedNode}
                  onChange={(e) => setSelectedNode(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] focus:border-blue-500 focus:outline-none"
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.id} ({node.role} - {node.status})
                    </option>
                  ))}
                  {nodes.length === 0 && (
                    <>
                      <option value="primary">primary (Primary)</option>
                      <option value="replica-1">replica-1 (Replica)</option>
                      <option value="replica-2">replica-2 (Replica)</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <button
              onClick={handleSimulateFailure}
              disabled={isSubmitting || !isBackendConnected}
              className="flex-1 py-1.5 px-3 rounded bg-rose-600/20 hover:bg-rose-600/30 disabled:opacity-50 text-rose-300 border border-rose-600/40 text-xs font-medium transition-colors"
            >
              Simulate Failure
            </button>
            <button
              onClick={handleSimulateRecovery}
              disabled={isSubmitting || !isBackendConnected}
              className="py-1.5 px-3 rounded bg-[#1c2128] hover:bg-[#21262d] disabled:opacity-50 text-[#e6edf3] border border-[#30363d] text-xs font-medium transition-colors"
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
              Promote an eligible replica to PRIMARY, increment the epoch, and fence the previous primary to prevent split-brain.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#7d8590] block mb-1">Target Replica</label>
                <select
                  value={targetPromotionNode}
                  onChange={(e) => setTargetPromotionNode(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] focus:border-blue-500 focus:outline-none"
                >
                  {replicas.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.id} ({rep.name})
                    </option>
                  ))}
                  {replicas.length === 0 && (
                    <>
                      <option value="replica-1">replica-1</option>
                      <option value="replica-2">replica-2</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-2 text-xs text-[#7d8590]">
                <div className="flex items-center justify-between p-2 rounded bg-[#0d1117] border border-[#21262d]">
                  <span>Current Leader:</span>
                  <span className="font-mono text-[#e6edf3]">
                    Epoch {cluster?.current_epoch ?? 1} ({primaryNode?.id ?? 'None'})
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-[#0d1117] border border-[#21262d]">
                  <span>Next Epoch:</span>
                  <span className="font-mono text-purple-400">
                    Epoch {(cluster?.current_epoch ?? 1) + 1}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleFailoverPromotion}
            disabled={isSubmitting || !isBackendConnected}
            className="w-full mt-6 py-2 px-3 rounded bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-50 text-blue-300 border border-blue-600/40 text-xs font-medium transition-colors flex items-center justify-center gap-2"
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
              Inject artificial latency onto a follower replica to observe real-time LSN lag and election priority.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#7d8590] block mb-1">Target Replica</label>
                <select
                  value={selectedReplicaForDelay}
                  onChange={(e) => setSelectedReplicaForDelay(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] focus:border-blue-500 focus:outline-none"
                >
                  {replicas.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.id} (Current Delay: {rep.replication_delay_ms}ms)
                    </option>
                  ))}
                  {replicas.length === 0 && (
                    <>
                      <option value="replica-1">replica-1</option>
                      <option value="replica-2">replica-2</option>
                    </>
                  )}
                </select>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[#7d8590]">Latency Delay:</span>
                <span className="font-mono text-[#e6edf3] font-semibold">{delayMs} ms</span>
              </div>
              <input
                type="range"
                min="0"
                max="5000"
                step="50"
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={handleApplyDelay}
            disabled={isSubmitting || !isBackendConnected}
            className="w-full mt-6 py-1.5 px-3 rounded bg-[#1c2128] hover:bg-[#21262d] disabled:opacity-50 text-[#e6edf3] border border-[#30363d] text-xs font-medium transition-colors"
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
          onClick={handleWriteRecord}
          disabled={isSubmitting || !isBackendConnected}
          className="py-1.5 px-4 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors flex items-center gap-2"
        >
          {isSubmitting ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Submit Write to Primary
        </button>
      </div>
    </div>
  )
}
