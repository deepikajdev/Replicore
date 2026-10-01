import React from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon?: React.ReactNode
  description?: string
  trend?: string
  trendColor?: 'success' | 'warning' | 'danger' | 'neutral'
  className?: string
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  description,
  trend,
  trendColor = 'neutral',
  className = '',
}) => {
  let trendClass = 'text-gray-400'
  if (trendColor === 'success') trendClass = 'text-emerald-400'
  else if (trendColor === 'warning') trendClass = 'text-amber-400'
  else if (trendColor === 'danger') trendClass = 'text-rose-400'

  return (
    <div
      className={`rounded-lg border border-[#30363d] bg-[#161b22] p-5 shadow-sm hover:border-[#484f58] transition-colors duration-150 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between text-[#7d8590] mb-3">
        <span className="text-xs font-medium tracking-wide uppercase">{title}</span>
        {icon && <div className="text-[#7d8590]">{icon}</div>}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold tracking-tight text-[#e6edf3]">
          {value}
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trendClass}`}>
            {trend}
          </span>
        )}
      </div>

      {description && (
        <div className="mt-2 text-xs text-[#7d8590] truncate">
          {description}
        </div>
      )}
    </div>
  )
}
