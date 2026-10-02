import { useContext } from 'react'
import { ClusterContext } from '../context/clusterContextState'
import type { ClusterContextType } from '../context/clusterContextState'

export const useCluster = (): ClusterContextType => {
  const context = useContext(ClusterContext)
  if (!context) {
    throw new Error('useCluster must be used within a ClusterProvider')
  }
  return context
}
