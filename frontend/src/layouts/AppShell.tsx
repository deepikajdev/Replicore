import React, { useState } from 'react'
import { Menu, Server, Radio } from 'lucide-react'
import { Sidebar } from './Sidebar'
import type { PageId } from '../types'

interface AppShellProps {
  currentPage: PageId
  onSelectPage: (page: PageId) => void
  children: React.ReactNode
}

export const AppShell: React.FC<AppShellProps> = ({
  currentPage,
  onSelectPage,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const pageTitles: Record<PageId, string> = {
    overview: 'Cluster Overview',
    nodes: 'Cluster Nodes & Topology',
    replication: 'Replication Stream & Lag',
    events: 'System Audit Logs',
    simulation: 'Failover & Outage Simulator',
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] flex">
      {/* Sidebar component */}
      <Sidebar
        currentPage={currentPage}
        onSelectPage={onSelectPage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Navbar */}
        <header className="h-16 bg-[#161b22] border-b border-[#30363d] sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#1c2128]"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-xs text-[#7d8590]">
                <span>Replicore Cluster</span>
                <span>/</span>
                <span className="text-[#e6edf3] font-medium">{pageTitles[currentPage]}</span>
              </div>
            </div>
          </div>

          {/* Right quick stats / actions */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-[#0d1117] border border-[#30363d] text-xs">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-[#7d8590]">Watchdog:</span>
              <span className="text-[#3fb950] font-mono">1.0s interval</span>
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#0d1117] border border-[#30363d] text-xs">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[#7d8590]">Primary:</span>
              <span className="text-blue-400 font-mono font-medium">node-1</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
