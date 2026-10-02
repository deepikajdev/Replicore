import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { BarChart3, Inbox } from 'lucide-react'
import type { ReplicaLagInfo } from '../types'

interface ReplicaLagBarChartProps {
  replicas: ReplicaLagInfo[]
  isLoading?: boolean
}

export const ReplicaLagBarChart: React.FC<ReplicaLagBarChartProps> = ({
  replicas,
  isLoading = false,
}) => {
  const chartData = replicas.map((r) => ({
    name: `${r.name} (${r.node_id})`,
    lagLsn: r.lag_lsn,
    pendingQueue: r.pending_queue_count,
    configuredDelay: r.configured_delay_ms,
  }))

  const hasData = chartData.length > 0

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">
              Current Replica Lag & Queue Comparison
            </h3>
          </div>
          <p className="text-xs text-[#7d8590] mt-0.5">
            Snapshot comparing follower LSN lag and unapplied queue buffers
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-[220px] w-full">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center text-[#7d8590] py-8">
            <Inbox className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs font-medium text-[#c9d1d9]">
              {isLoading ? 'Loading replica metrics...' : 'No follower replicas available.'}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#484f58"
                tick={{ fill: '#7d8590', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#30363d' }}
              />
              <YAxis
                stroke="#484f58"
                tick={{ fill: '#7d8590', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: '#30363d' }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161b22',
                  borderColor: '#30363d',
                  borderRadius: '6px',
                  color: '#e6edf3',
                  fontSize: '11px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                }}
                labelStyle={{ color: '#7d8590', fontWeight: 600, marginBottom: '4px' }}
              />
              <Legend
                wrapperStyle={{
                  paddingTop: '8px',
                  fontSize: '11px',
                  color: '#c9d1d9',
                }}
              />
              <Bar
                dataKey="lagLsn"
                name="Lag (LSN units)"
                fill="#f0883e"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
              <Bar
                dataKey="pendingQueue"
                name="Pending Queue Count"
                fill="#8957e5"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
