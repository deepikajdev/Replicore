import React from 'react'
import type { NodeRole, NodeStatus } from '../types'

interface StatusBadgeProps {
  status?: NodeStatus
  role?: NodeRole
  isFenced?: boolean
  label?: string
  className?: string
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  role,
  isFenced,
  label,
  className = '',
}) => {
  if (isFenced) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-red-950/70 text-red-300 border border-red-800/80 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        FENCED
      </span>
    )
  }

  if (role) {
    let colorClasses = 'bg-gray-800/80 text-gray-300 border-gray-700'
    if (role === 'PRIMARY') {
      colorClasses = 'bg-blue-950/70 text-blue-300 border-blue-700/70'
    } else if (role === 'REPLICA') {
      colorClasses = 'bg-purple-950/70 text-purple-300 border-purple-700/70'
    } else if (role === 'STANDBY') {
      colorClasses = 'bg-amber-950/70 text-amber-300 border-amber-700/70'
    }

    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${colorClasses} ${className}`}
      >
        {role}
      </span>
    )
  }

  if (status) {
    let dotClass = 'bg-gray-400'
    let textClasses = 'text-gray-300 bg-gray-900/60 border-gray-800'

    switch (status) {
      case 'HEALTHY':
        dotClass = 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
        textClasses = 'text-emerald-300 bg-emerald-950/40 border-emerald-800/50'
        break
      case 'DEGRADED':
        dotClass = 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
        textClasses = 'text-amber-300 bg-amber-950/40 border-amber-800/50'
        break
      case 'DOWN':
        dotClass = 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
        textClasses = 'text-rose-300 bg-rose-950/40 border-rose-800/50'
        break
      case 'ISOLATED':
        dotClass = 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]'
        textClasses = 'text-purple-300 bg-purple-950/40 border-purple-800/50'
        break
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider border ${textClasses} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {label || status}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider border bg-gray-900/60 border-gray-800 text-gray-300 ${className}`}
    >
      {label || 'UNKNOWN'}
    </span>
  )
}
