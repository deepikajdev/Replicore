import React, { useState } from 'react'
import { AppShell } from './layouts/AppShell'
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
        return <OverviewPage />
      case 'nodes':
        return <ClusterNodesPage />
      case 'replication':
        return <ReplicationPage />
      case 'events':
        return <EventLogsPage />
      case 'simulation':
        return <SimulationPage />
      default:
        return <OverviewPage />
    }
  }

  return (
    <AppShell currentPage={currentPage} onSelectPage={setCurrentPage}>
      {renderContent()}
    </AppShell>
  )
}

export default App
