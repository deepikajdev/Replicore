import { useCluster } from './useCluster'
import type { MetricsSample } from '../types'

export interface UseMetricsHistoryResult {
  history: MetricsSample[]
  latestSample: MetricsSample | null
  sampleCount: number
}

export const useMetricsHistory = (): UseMetricsHistoryResult => {
  const { metricsHistory } = useCluster()

  return {
    history: metricsHistory,
    latestSample: metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1] : null,
    sampleCount: metricsHistory.length,
  }
}
