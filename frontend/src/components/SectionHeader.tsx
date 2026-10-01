import React from 'react'

interface SectionHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#30363d] mb-6 ${className}`}>
      <div>
        <h1 className="text-xl font-semibold text-[#e6edf3] tracking-tight">{title}</h1>
        {description && (
          <p className="text-xs text-[#7d8590] mt-1">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
