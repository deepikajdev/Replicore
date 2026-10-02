import React from 'react'
import { ShieldAlert, CheckCircle, AlertTriangle, XCircle, EyeOff, Crown, Copy } from 'lucide-react'
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
        role="status"
        aria-label="Node status: Fenced. Writes are blocked."
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-red-950/70 text-red-300 border border-red-800/80 ${className}`}
      >
        <ShieldAlert className="w-3 h-3 text-red-400 shrink-0" aria-hidden="true" />
        <span>FENCED</span>
      </span>
    )
  }

  if (role) {
    let colorClasses = 'bg-gray-800/80 text-gray-300 border-gray-700'
    let Icon = Copy
    if (role === 'PRIMARY') {
      colorClasses = 'bg-blue-950/70 text-blue-300 border-blue-700/70'
      Icon = Crown
    } else if (role === 'REPLICA') {
      colorClasses = 'bg-purple-950/70 text-purple-300 border-purple-700/70'
      Icon = Copy
    } else if (role === 'STANDBY') {
      colorClasses = 'bg-amber-950/70 text-amber-300 border-amber-700/70'
      Icon = Copy
    }

    return (
      <span
        role="status"
        aria-label={`Node role: ${role}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${colorClasses} ${className}`}
      >
        <Icon className="w-3 h-3 shrink-0 opacity-80" aria-hidden="true" />
        <span>{role}</span>
      </span>
    )
  }

  if (status) {
    let textClasses = 'text-gray-300 bg-gray-900/60 border-gray-800'
    let Icon = AlertTriangle

    switch (status) {
      case 'HEALTHY':
        textClasses = 'text-emerald-300 bg-emerald-950/50 border-emerald-800/60'
        Icon = CheckCircle
        break
      case 'DEGRADED':
        textClasses = 'text-amber-300 bg-amber-950/50 border-amber-800/60'
        Icon = AlertTriangle
        break
      case 'DOWN':
        textClasses = 'text-rose-300 bg-rose-950/50 border-rose-800/60'
        Icon = XCircle
        break
      case 'ISOLATED':
        textClasses = 'text-purple-300 bg-purple-950/50 border-purple-800/60'
        Icon = EyeOff
        break
    }

    return (
      <span
        role="status"
        aria-label={`Health status: ${status}`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider border ${textClasses} ${className}`}
      >
        <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>{label || status}</span>
      </span>
    )
  }

  return (
    <span
      role="status"
      aria-label="Node status: Unknown"
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider border bg-gray-900/60 border-gray-800 text-gray-300 ${className}`}
    >
      {label || 'UNKNOWN'}
    </span>
  )
}
