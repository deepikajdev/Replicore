import React, { useState } from 'react'
import { AppShell } from './layouts/AppShell'
import { ClusterProvider } from './context/ClusterContext'
import { OverviewPage } from './pages/OverviewPage'
import { ClusterNodesPage } from './pages/ClusterNodesPage'
import { ReplicationPage } from './pages/ReplicationPage'
import { EventLogsPage } from './pages/EventLogsPage'
import { SimulationPage } from './pages/SimulationPage'
import type { PageId } from './types'

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageId>('overview')

  const renderContent = () => {
    switch (currentPage) {
      case 'overview':
        return <OverviewPage onNavigate={setCurrentPage} />
      case 'nodes':
        return <ClusterNodesPage />
      case 'replication':
        return <ReplicationPage />
      case 'events':
        return <EventLogsPage />
      case 'simulation':
        return <SimulationPage />
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

