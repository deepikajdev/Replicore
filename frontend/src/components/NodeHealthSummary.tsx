import React from 'react'
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  WifiOff,
  ShieldAlert,
  Server,
} from 'lucide-react'
import type { NodeInfo } from '../types'

interface NodeHealthSummaryProps {
  nodes: NodeInfo[]
  isBackendConnected: boolean
  autoFailover?: boolean
  epoch?: number
}

export const NodeHealthSummary: React.FC<NodeHealthSummaryProps> = ({
  nodes,
  isBackendConnected,
  autoFailover = false,
  epoch = 1,
}) => {
  const healthyCount = nodes.filter((n) => n.status === 'HEALTHY').length
  const degradedCount = nodes.filter((n) => n.status === 'DEGRADED').length
  const downCount = nodes.filter((n) => n.status === 'DOWN').length
  const isolatedCount = nodes.filter((n) => n.status === 'ISOLATED').length
  const fencedCount = nodes.filter((n) => n.is_fenced).length

  const totalNodes = nodes.length

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">
              Node Fleet Health
            </h3>
          </div>
          <p className="text-xs text-[#7d8590] mt-0.5">
            Real-time status breakdown across all cluster members
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#0d1117] border border-[#30363d] text-[#7d8590]">
            Total Nodes: {totalNodes}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
              autoFailover
                ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                : 'bg-[#21262d] border-[#30363d] text-[#7d8590]'
            }`}
          >
            Auto-Failover: {autoFailover ? 'ON' : 'OFF'}
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#0d1117] border border-[#30363d] text-[#7d8590]">
            Epoch {epoch}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* HEALTHY */}
        <div className="p-3 rounded-md bg-[#0d1117] border border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-emerald-950/50 border border-emerald-800/60 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#7d8590] uppercase tracking-wider">
                Healthy
              </div>
              <div className="text-lg font-bold text-emerald-400">
                {isBackendConnected ? healthyCount : '-'}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-[#7d8590]">
            {totalNodes > 0 ? `${Math.round((healthyCount / totalNodes) * 100)}%` : '0%'}
          </div>
        </div>

        {/* DEGRADED */}
        <div className="p-3 rounded-md bg-[#0d1117] border border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-amber-950/50 border border-amber-800/60 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#7d8590] uppercase tracking-wider">
                Degraded
              </div>
              <div className="text-lg font-bold text-amber-400">
                {isBackendConnected ? degradedCount : '-'}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-[#7d8590]">
            {totalNodes > 0 ? `${Math.round((degradedCount / totalNodes) * 100)}%` : '0%'}
          </div>
        </div>

        {/* DOWN */}
        <div className="p-3 rounded-md bg-[#0d1117] border border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-rose-950/50 border border-rose-800/60 text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#7d8590] uppercase tracking-wider">
                Down
              </div>
              <div className="text-lg font-bold text-rose-400">
                {isBackendConnected ? downCount : '-'}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-[#7d8590]">
            {totalNodes > 0 ? `${Math.round((downCount / totalNodes) * 100)}%` : '0%'}
          </div>
        </div>

        {/* ISOLATED */}
        <div className="p-3 rounded-md bg-[#0d1117] border border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-orange-950/50 border border-orange-800/60 text-orange-400">
              <WifiOff className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#7d8590] uppercase tracking-wider">
                Isolated
              </div>
              <div className="text-lg font-bold text-orange-400">
                {isBackendConnected ? isolatedCount : '-'}
              </div>
            </div>
          </div>
          <div className="text-[11px] text-[#7d8590]">
            {totalNodes > 0 ? `${Math.round((isolatedCount / totalNodes) * 100)}%` : '0%'}
          </div>
        </div>
      </div>

      {fencedCount > 0 && (
        <div className="mt-3 p-2.5 rounded-md bg-rose-950/40 border border-rose-800/60 flex items-center gap-2 text-xs text-rose-300">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            <strong>Fencing Active:</strong> {fencedCount} node(s) marked fenced to prevent split-brain writes.
          </span>
        </div>
      )}
    </div>
  )
}
