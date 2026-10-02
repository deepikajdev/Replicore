import React, { useState, Suspense, lazy } from 'react'
import { AppShell } from './layouts/AppShell'
import { ClusterProvider } from './context/ClusterContext'
import { OverviewPage } from './pages/OverviewPage'
import { PageSkeleton } from './components/PageSkeleton'
import type { PageId } from './types'

// Lazy-load secondary pages to optimize initial bundle and startup speed
const ClusterNodesPage = lazy(() =>
  import('./pages/ClusterNodesPage').then((m) => ({ default: m.ClusterNodesPage }))
)
const ReplicationPage = lazy(() =>
  import('./pages/ReplicationPage').then((m) => ({ default: m.ReplicationPage }))
)
const EventLogsPage = lazy(() =>
  import('./pages/EventLogsPage').then((m) => ({ default: m.EventLogsPage }))
)
const SimulationPage = lazy(() =>
  import('./pages/SimulationPage').then((m) => ({ default: m.SimulationPage }))
)

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageId>('overview')

  const renderContent = () => {
    switch (currentPage) {
      case 'overview':
        return <OverviewPage onNavigate={setCurrentPage} />
      case 'nodes':
        return (
          <Suspense fallback={<PageSkeleton />}>
            <ClusterNodesPage />
          </Suspense>
        )
      case 'replication':
        return (
          <Suspense fallback={<PageSkeleton />}>
            <ReplicationPage />
          </Suspense>
        )
      case 'events':
        return (
          <Suspense fallback={<PageSkeleton />}>
            <EventLogsPage />
          </Suspense>
        )
      case 'simulation':
        return (
          <Suspense fallback={<PageSkeleton />}>
            <SimulationPage />
          </Suspense>
        )
      default:
        return <OverviewPage onNavigate={setCurrentPage} />
    }
  }

  return (
    <ClusterProvider>
      <AppShell currentPage={currentPage} onSelectPage={setCurrentPage}>
        {renderContent()}
      </AppShell>
    </ClusterProvider>
  )
}

export default App
