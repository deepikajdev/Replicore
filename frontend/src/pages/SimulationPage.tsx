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
  WifiOff,
  ShieldCheck,
  Flame,
} from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'
import { FailoverConfirmationModal, type ConfirmationConfig } from '../components/FailoverConfirmationModal'
import { FailoverEventTimeline } from '../components/FailoverEventTimeline'
import { ReadTestControl } from '../components/ReadTestControl'
import { DemoWorkflowGuide } from '../components/DemoWorkflowGuide'
import { useCluster } from '../hooks/useCluster'
import {
  simulateNodeFailure,
  simulateNodeRecovery,
  triggerFailover,
  setReplicationDelay,
  writeRecord,
} from '../services/api'
import { formatErrorMessage } from '../services/errors'
import type { RecordResponse } from '../types'

export const SimulationPage: React.FC = () => {
  const { cluster, events, refreshAll, isBackendConnected } = useCluster()

  const nodes = cluster?.nodes ?? []
  const primaryNode = nodes.find((n) => n.role === 'PRIMARY')
  const replicas = nodes.filter((n) => n.role === 'REPLICA')

  const [selectedNode, setSelectedNode] = useState<string>('replica-1')
  const [selectedReplicaForDelay, setSelectedReplicaForDelay] = useState<string>('replica-2')
  const [targetPromotionNode, setTargetPromotionNode] = useState<string>('replica-1')
  const [delayMs, setDelayMs] = useState<number>(1000)

  // Write testing state
  const [writeTargetNode, setWriteTargetNode] = useState<string>('')
  const [writeKey, setWriteKey] = useState<string>('order:2001')
  const [writeValue, setWriteValue] = useState<string>('{"status": "CONFIRMED", "amount": 149.99}')
  const [lastWriteResult, setLastWriteResult] = useState<RecordResponse | null>(null)

  // Status and Confirmation
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [confirmConfig, setConfirmConfig] = useState<ConfirmationConfig | null>(null)
  const [statusMessage, setStatusMessage] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type })
    setTimeout(() => {
      setStatusMessage(null)
    }, 6000)
  }

  // --- Failure / Recovery Handlers ---

  const executeFailure = async (nodeId: string) => {
    setIsSubmitting(true)
    try {
      const res = await simulateNodeFailure(nodeId)
      showStatus(res.message || `Outage injected on node '${nodeId}'. Heartbeat watchdog will detect missed probes.`, 'success')
      await refreshAll()
    } catch (err) {
      showStatus(`Failed to simulate outage: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePromptFailure = (nodeId: string) => {
    const target = nodes.find((n) => n.id === nodeId)
    const isPrimary = target?.role === 'PRIMARY'

    setConfirmConfig({
      title: isPrimary ? 'Confirm Primary Leader Outage' : 'Confirm Follower Outage',
      description: `Simulate a hardware failure or network partition on '${nodeId}' (${target?.role ?? 'NODE'}, ${target?.status ?? 'UNKNOWN'}). The heartbeat watchdog will probe the node and declare it DOWN after 3 missed heartbeats.`,
      impactWarning: isPrimary
        ? 'Failing the active Primary will immediately disrupt write availability. The cluster will initiate automatic failover election to promote the most up-to-date replica and increment the epoch.'
        : undefined,
      targetNodeId: nodeId,
      actionLabel: isPrimary ? 'Fail Primary Node' : 'Fail Node',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig(null)
        await executeFailure(nodeId)
      },
    })
  }

  const handleSimulateRecovery = async () => {
    if (!selectedNode) return
    setIsSubmitting(true)
    try {
      const res = await simulateNodeRecovery(selectedNode)
      showStatus(res.message || `Node '${selectedNode}' connectivity restored. Rejoining cluster.`, 'success')
      await refreshAll()
    } catch (err) {
      showStatus(`Failed to recover node: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Manual Failover Handler ---

  const executeFailover = async (targetId: string) => {
    setIsSubmitting(true)
    try {
      const res = await triggerFailover(targetId)
      showStatus(
        res.message || `Node '${res.promoted_node_id}' promoted to PRIMARY at epoch ${res.new_epoch}.`,
        'success'
      )
      await refreshAll()
    } catch (err) {
      showStatus(`Manual promotion failed: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePromptFailover = () => {
    const target = targetPromotionNode || replicas[0]?.id
    if (!target) {
      showStatus('No eligible replica available for promotion.', 'error')
      return
    }

    const currentEpoch = cluster?.current_epoch ?? 1
    const currentPrimary = primaryNode?.id ?? 'None'

    setConfirmConfig({
      title: 'Confirm Manual Cluster Failover',
      description: `Force promotion of follower replica '${target}' to new PRIMARY leader. The cluster will advance from Epoch ${currentEpoch} to Epoch ${currentEpoch + 1}.`,
      impactWarning: `Existing primary '${currentPrimary}' will be forcefully fenced with is_fenced=true to prevent split-brain writes. Any lingering client write targeted at it will receive HTTP 409 Conflict.`,
      targetNodeId: target,
      actionLabel: `Promote ${target} to Leader (Epoch ${currentEpoch + 1})`,
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig(null)
        await executeFailover(target)
      },
    })
  }

  // --- Replication Delay Handler ---

  const handleApplyDelay = async () => {
    if (!selectedReplicaForDelay) return
    setIsSubmitting(true)
    try {
      const res = await setReplicationDelay(selectedReplicaForDelay, delayMs)
      showStatus(
        res.message || `Replication delay on '${selectedReplicaForDelay}' set to ${delayMs}ms.`,
        'success'
      )
      await refreshAll()
    } catch (err) {
      showStatus(`Failed to set delay: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Write Pipeline Handler ---

  const handleWriteRecord = async () => {
    if (!writeKey.trim()) {
      showStatus('Write key cannot be empty.', 'error')
      return
    }
    setIsSubmitting(true)
    setLastWriteResult(null)
    try {
      const res = await writeRecord(
        {
          key: writeKey.trim(),
          value: writeValue,
          target_node_id: writeTargetNode || undefined,
        },
        writeTargetNode || undefined
      )
      setLastWriteResult(res)
      showStatus(
        `Write accepted: Key "${res.key}" committed at LSN ${res.lsn} (node: ${res.node_id})`,
        'success'
      )
      await refreshAll()
    } catch (err) {
      showStatus(`Write rejected: ${formatErrorMessage(err)}`, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedNodeObj = nodes.find((n) => n.id === selectedNode)
  const isSelectedNodeDown = selectedNodeObj?.status === 'DOWN' || selectedNodeObj?.status === 'ISOLATED'
  const isSelectedNodeHealthy = selectedNodeObj?.status === 'HEALTHY'

  return (
    <div className="space-y-6">
      {/* Confirmation Modal */}
      <FailoverConfirmationModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
        isSubmitting={isSubmitting}
      />

      {/* Header */}
      <SectionHeader
        title="Simulation & Failover Operations Console"
        description="Inject node failure, test automatic watchdog failover, execute manual promotion, and verify split-brain fencing."
        action={
          <div className="flex items-center gap-2">
            {!isBackendConnected ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-medium">
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                Backend Offline
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/50 border border-amber-800/60 text-amber-300 text-xs font-medium">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Live Control Engine Active
              </span>
            )}
          </div>
        }
      />

      {/* Notification Banner */}
      {statusMessage && (
        <div
          role="alert"
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

      {/* Instructional Walkthrough Runbook */}
      <DemoWorkflowGuide />

      {/* ── ZONE 1: SAFE ACTIONS (Read, Write, Lag Tuning) ───────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#e6edf3]">
            Safe Actions & Consistency Verification
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/50 font-mono">
            Non-Destructive
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Write Pipeline Test */}
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-400" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-[#e6edf3]">
                    Write Pipeline & Split-Brain Test
                  </h3>
                </div>
              </div>
              <p className="text-xs text-[#7d8590] mb-4">
                Execute transactional writes. Direct a write to a fenced node to observe HTTP 409 Conflict.
              </p>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-[#7d8590] block mb-1">
                    Target Node (Default: Auto-route to leader)
                  </label>
                  <select
                    value={writeTargetNode}
                    onChange={(e) => setWriteTargetNode(e.target.value)}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Auto-Route to Current Primary ({primaryNode?.id ?? 'None'})</option>
                    {nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        Direct to {node.id} ({node.role} • {node.status}{node.is_fenced ? ' • FENCED' : ''})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-[#7d8590] block mb-1">Key</label>
                    <input
                      type="text"
                      value={writeKey}
                      onChange={(e) => setWriteKey(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs text-[#7d8590] block mb-1">Value (Payload / JSON)</label>
                    <input
                      type="text"
                      value={writeValue}
                      onChange={(e) => setWriteValue(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#21262d]">
              <button
                onClick={handleWriteRecord}
                disabled={isSubmitting || !isBackendConnected}
                className="py-1.5 px-4 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Commit Write Transaction
              </button>

              {lastWriteResult && (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-800/50">
                  LSN {lastWriteResult.lsn} Committed ({lastWriteResult.node_id})
                </span>
              )}
            </div>
          </div>

          {/* Read Query & Eventual Consistency Test */}
          <ReadTestControl nodes={nodes} isBackendConnected={isBackendConnected} />
        </div>
      </div>

      {/* ── ZONE 2: DISRUPTIVE ACTIONS (Faults, Outages, Failovers) ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-4 h-4 text-rose-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#e6edf3]">
            Disruptive Fault Injection & Failover Operations
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950/50 text-rose-300 border border-rose-800/60 font-mono">
            Requires Confirmation
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card 1: Node Outage Injection & Recovery */}
          <div className="rounded-lg border border-rose-900/40 bg-[#161b22] p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#e6edf3] font-semibold text-sm mb-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h3>Node Outage & Recovery</h3>
              </div>
              <p className="text-xs text-[#7d8590] mb-4">
                Inject hardware crash or partition. Watchdog declares node DOWN after 3 missed heartbeats.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#7d8590] block mb-1">Target Cluster Node</label>
                  <select
                    value={selectedNode}
                    onChange={(e) => setSelectedNode(e.target.value)}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-rose-500 focus:outline-none"
                  >
                    {nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.id} ({node.role} • {node.status}{node.is_fenced ? ' • FENCED' : ''})
                      </option>
                    ))}
                    {nodes.length === 0 && <option value="primary">primary</option>}
                  </select>
                </div>

                {selectedNodeObj && (
                  <div className="p-2.5 rounded bg-[#0d1117] border border-[#21262d] text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#7d8590]">Current Role:</span>
                      <span className={`font-mono font-semibold ${selectedNodeObj.role === 'PRIMARY' ? 'text-blue-400' : 'text-purple-400'}`}>
                        {selectedNodeObj.role}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7d8590]">Status:</span>
                      <span
                        className={`font-mono font-semibold ${
                          selectedNodeObj.status === 'HEALTHY'
                            ? 'text-emerald-400'
                            : selectedNodeObj.status === 'DEGRADED'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {selectedNodeObj.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#7d8590]">Fencing State:</span>
                      <span className={`font-mono ${selectedNodeObj.is_fenced ? 'text-rose-400 font-bold' : 'text-[#7d8590]'}`}>
                        {selectedNodeObj.is_fenced ? 'FENCED (Split-Brain Guard)' : 'Not Fenced'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-6">
              <button
                onClick={() => handlePromptFailure(selectedNode)}
                disabled={isSubmitting || !isBackendConnected || isSelectedNodeDown}
                className="flex-1 py-2 px-3 rounded bg-rose-600/20 hover:bg-rose-600/30 disabled:opacity-40 text-rose-300 border border-rose-600/40 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Simulate Outage
              </button>
              <button
                onClick={handleSimulateRecovery}
                disabled={isSubmitting || !isBackendConnected || isSelectedNodeHealthy}
                className="flex-1 py-2 px-3 rounded bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 text-emerald-300 border border-emerald-600/40 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Recover Node
              </button>
            </div>
          </div>

          {/* Card 2: Manual Failover Promotion */}
          <div className="rounded-lg border border-purple-900/40 bg-[#161b22] p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#e6edf3] font-semibold text-sm mb-2">
                <ShieldAlert className="w-4 h-4 text-purple-400" />
                <h3>Manual Failover & Promotion</h3>
              </div>
              <p className="text-xs text-[#7d8590] mb-4">
                Promote an eligible replica to PRIMARY, increment epoch, and fence previous primary against split-brain.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#7d8590] block mb-1">Target Replica for Promotion</label>
                  <select
                    value={targetPromotionNode}
                    onChange={(e) => setTargetPromotionNode(e.target.value)}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-purple-500 focus:outline-none"
                  >
                    {replicas.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.id} ({rep.name} • LSN {rep.last_applied_lsn} • {rep.status})
                      </option>
                    ))}
                    {replicas.length === 0 && <option value="">No replicas registered</option>}
                  </select>
                </div>

                <div className="space-y-1.5 text-xs text-[#7d8590]">
                  <div className="flex items-center justify-between p-2 rounded bg-[#0d1117] border border-[#21262d]">
                    <span>Current Leader:</span>
                    <span className="font-mono text-[#e6edf3]">
                      Epoch {cluster?.current_epoch ?? 1} ({primaryNode?.id ?? 'None'})
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#0d1117] border border-[#21262d]">
                    <span>Next Leadership Epoch:</span>
                    <span className="font-mono text-purple-400 font-semibold">
                      Epoch {(cluster?.current_epoch ?? 1) + 1}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handlePromptFailover}
              disabled={isSubmitting || !isBackendConnected || replicas.length === 0}
              className="w-full mt-6 py-2 px-3 rounded bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-40 text-purple-300 border border-purple-600/40 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
              Execute Failover Promotion
            </button>
          </div>

          {/* Card 3: Replication Delay Tuner */}
          <div className="rounded-lg border border-amber-900/40 bg-[#161b22] p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#e6edf3] font-semibold text-sm mb-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h3>Replication Lag Tuner</h3>
              </div>
              <p className="text-xs text-[#7d8590] mb-4">
                Inject artificial replication delay to create follower lag and demonstrate eventual consistency.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#7d8590] block mb-1">Target Replica</label>
                  <select
                    value={selectedReplicaForDelay}
                    onChange={(e) => setSelectedReplicaForDelay(e.target.value)}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-amber-500 focus:outline-none"
                  >
                    {replicas.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.id} (Configured: {rep.replication_delay_ms}ms)
                      </option>
                    ))}
                    {replicas.length === 0 && <option value="">No replicas available</option>}
                  </select>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#7d8590]">Artificial Delay:</span>
                  <span className="font-mono text-amber-400 font-semibold">{delayMs} ms</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="50"
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#7d8590] font-mono">
                  <span>0ms (Immediate)</span>
                  <span>2500ms</span>
                  <span>5000ms</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleApplyDelay}
              disabled={isSubmitting || !isBackendConnected || replicas.length === 0}
              className="w-full mt-6 py-2 px-3 rounded bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-40 text-amber-300 border border-amber-600/40 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Apply Delay ({delayMs}ms)
            </button>
          </div>
        </div>
      </div>

      {/* Lifecycle & Failover Event Stream */}
      <FailoverEventTimeline events={events} limit={12} />
    </div>
  )
}
