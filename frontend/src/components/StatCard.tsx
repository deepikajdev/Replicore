import React from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon?: React.ReactNode
  description?: string
  trend?: string
  trendColor?: 'success' | 'warning' | 'danger' | 'neutral'
  className?: string
  isLoading?: boolean
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  description,
  trend,
  trendColor = 'neutral',
  className = '',
  isLoading = false,
}) => {
  let trendClass = 'text-[#7d8590]'
  if (trendColor === 'success') trendClass = 'text-[#3fb950]'
  else if (trendColor === 'warning') trendClass = 'text-[#d29922]'
  else if (trendColor === 'danger') trendClass = 'text-[#f85149]'

  return (
    <div
      className={`rounded-lg border border-[#30363d] bg-[#161b22] p-4 sm:p-5 shadow-sm hover:border-[#484f58] transition-colors duration-150 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between text-[#7d8590] mb-3">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-[#7d8590]">
          {title}
        </span>
        {icon && (
          <div className="text-[#7d8590] flex-shrink-0" aria-hidden="true">
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        {isLoading ? (
          <div className="h-7 w-24 bg-[#1c2128] rounded animate-pulse" />
        ) : (
          <div className="text-xl sm:text-2xl font-bold tracking-tight font-mono text-[#e6edf3]">
            {value}
          </div>
        )}
        {trend && !isLoading && (
          <span className={`text-xs font-medium font-mono ${trendClass}`}>
            {trend}
          </span>
        )}
      </div>

      {description && (
        <div className="mt-2 text-xs text-[#7d8590] truncate" title={description}>
          {description}
        </div>
      )}
    </div>
  )
}
