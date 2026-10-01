import React from 'react'
import {
  LayoutDashboard,
  Server,
  RefreshCw,
  ScrollText,
  Zap,
  Activity,
  ChevronRight,
  Shield,
} from 'lucide-react'
import type { PageId } from '../types'

interface SidebarProps {
  currentPage: PageId
  onSelectPage: (page: PageId) => void
  isOpen: boolean
  onClose: () => void
}

interface NavItemConfig {
  id: PageId
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'nodes', label: 'Cluster Nodes', icon: Server, badge: '3' },
  { id: 'replication', label: 'Replication', icon: RefreshCw },
  { id: 'events', label: 'Event Logs', icon: ScrollText },
  { id: 'simulation', label: 'Simulation', icon: Zap },
]

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  isOpen,
  onClose,
}) => {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#161b22] border-r border-[#30363d] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-[#30363d]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm tracking-tight text-[#e6edf3]">REPLICORE</span>
                <span className="text-[10px] uppercase font-mono px-1 py-0.2 bg-blue-950 text-blue-300 rounded border border-blue-800/60">v0.4</span>
              </div>
              <p className="text-[11px] text-[#7d8590]">HA Replication Lab</p>
            </div>
          </div>
        </div>

        {/* Cluster Status Quick Pill */}
        <div className="px-4 py-3 border-b border-[#21262d]">
          <div className="rounded-md bg-[#0d1117] border border-[#30363d] p-2.5 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span className="text-[#e6edf3] font-medium">Cluster Active</span>
            </div>
            <span className="text-[10px] font-mono text-[#7d8590] bg-[#161b22] px-1.5 py-0.5 rounded border border-[#30363d]">
              Epoch 1
            </span>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-2 pb-2 text-[10px] font-semibold text-[#7d8590] uppercase tracking-wider">
            Navigation
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectPage(item.id)
                  onClose()
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#1c2128]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-[#7d8590]'}`} />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        isActive
                          ? 'bg-blue-900/60 text-blue-200'
                          : 'bg-[#21262d] text-[#7d8590]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-400" />}
                </div>
              </button>
            )
          })}
        </nav>

        {/* System Info Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d1117]/60">
          <div className="flex items-center justify-between text-[11px] text-[#7d8590]">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-emerald-400" />
              Watchdog Active
            </span>
            <span className="font-mono text-[10px]">ASYNC Mode</span>
          </div>
        </div>
      </aside>
    </>
  )
}
