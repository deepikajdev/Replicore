import React from 'react'

export const PageSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Loading page content">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#30363d] mb-6">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-[#1c2128] rounded" />
          <div className="h-3 w-80 bg-[#1c2128]/70 rounded" />
        </div>
        <div className="h-8 w-32 bg-[#1c2128] rounded" />
      </div>

      {/* Metric Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 h-28 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <div className="h-3 w-24 bg-[#1c2128] rounded" />
              <div className="h-4 w-4 bg-[#1c2128] rounded-full" />
            </div>
            <div className="h-7 w-28 bg-[#1c2128] rounded" />
            <div className="h-2.5 w-36 bg-[#1c2128]/60 rounded" />
          </div>
        ))}
      </div>

      {/* Main content panel skeleton */}
      <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-6 h-72 flex flex-col justify-between">
        <div className="h-4 w-40 bg-[#1c2128] rounded" />
        <div className="h-48 w-full bg-[#1c2128]/40 rounded-md border border-[#21262d]" />
      </div>
      <span className="sr-only">Loading page data...</span>
    </div>
  )
}
