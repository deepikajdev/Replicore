import React, { useState } from 'react'
import { Search, Database, RefreshCw, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { readData } from '../services/api'
import { formatErrorMessage } from '../services/errors'
import type { NodeInfo } from '../types'

interface ReadTestControlProps {
  nodes: NodeInfo[]
  isBackendConnected: boolean
}

export const ReadTestControl: React.FC<ReadTestControlProps> = ({
  nodes,
  isBackendConnected,
}) => {
  const [selectedNode, setSelectedNode] = useState<string>('primary')
  const [readKey, setReadKey] = useState<string>('user:101')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [result, setResult] = useState<{
    requested_node: string
    key: string | null
    data: unknown
    is_stale_possible: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRead = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const data = await readData(
        selectedNode || undefined,
        readKey.trim() || undefined
      )
      setResult(data)
    } catch (err) {
      setError(formatErrorMessage(err))
      setResult(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">
              Read Query & Eventual Consistency Test
            </h3>
          </div>
          <p className="text-xs text-[#7d8590] mt-0.5">
            Query individual cluster nodes to observe replication propagation or stale reads during lag
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-[#7d8590] block mb-1">Target Node to Query</label>
          <select
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-blue-500 focus:outline-none"
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id} ({node.role} - {node.status})
              </option>
            ))}
            {nodes.length === 0 && <option value="primary">primary</option>}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-[#7d8590] block mb-1">
            Record Key (optional — leave empty for all keys)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={readKey}
              onChange={(e) => setReadKey(e.target.value)}
              placeholder="e.g. user:101"
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] font-mono focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleRead}
              disabled={isSubmitting || !isBackendConnected}
              className="py-1.5 px-4 rounded bg-[#21262d] hover:bg-[#30363d] disabled:opacity-50 text-[#e6edf3] border border-[#30363d] text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5 text-blue-400" />
              )}
              Execute Read
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3 rounded bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Read Error: {error}</span>
        </div>
      )}

      {/* Result state */}
      {result && (
        <div className="mt-3 p-3 rounded bg-[#0d1117] border border-[#30363d] space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-[#21262d] pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-[#e6edf3]">
                Query Result from {result.requested_node}
              </span>
            </div>
            {result.is_stale_possible && (
              <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50">
                <Info className="w-3 h-3" />
                Follower Read (Eventual Consistency)
              </span>
            )}
          </div>
          <pre className="p-2 rounded bg-[#161b22] border border-[#21262d] text-xs font-mono text-[#c9d1d9] overflow-x-auto max-h-40">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
