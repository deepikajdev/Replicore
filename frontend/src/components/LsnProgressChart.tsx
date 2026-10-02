import React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { GitCommit, Clock } from 'lucide-react'
import type { MetricsSample, ReplicaLagInfo } from '../types'

interface LsnProgressChartProps {
  history: MetricsSample[]
  replicas?: ReplicaLagInfo[]
  isLoading?: boolean
}

const FOLLOWER_COLORS = [
  '#3fb950', // green
  '#d29922', // amber
  '#a371f7', // purple
  '#f85149', // rose
]

export const LsnProgressChart: React.FC<LsnProgressChartProps> = ({
  history,
  replicas = [],
  isLoading = false,
}) => {
  const replicaNodeIds = Array.from(
    new Set([
      ...replicas.map((r) => r.node_id),
      ...history.flatMap((h) => h.replicas.map((r) => r.nodeId)),
    ])
  )

  const hasData = history.length > 0

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-[#e6edf3]">
              WAL LSN Progression
            </h3>
          </div>
          <p className="text-xs text-[#7d8590] mt-0.5">
            Monotonic Write-Ahead Log progression: Primary head vs follower applied LSN
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-[#0d1117] border border-[#30363d] text-[#7d8590]">
            <Clock className="w-3 h-3 text-[#7d8590]" />
            {history.length > 0 ? `${history.length} / 60 samples` : 'Waiting...'}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-[220px] w-full">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center text-[#7d8590] py-8">
            <GitCommit className="w-8 h-8 opacity-30 mb-2 animate-pulse" />
            <p className="text-xs font-medium text-[#c9d1d9]">
              {isLoading
                ? 'Gathering telemetry...'
                : 'Awaiting telemetry samples (2.5s cycle)...'}
            </p>
            <p className="text-[11px] text-[#7d8590] mt-1 max-w-xs">
              Primary WAL commits and replica applied sequences will track live as writes occur.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={history}
              margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
              <XAxis
                dataKey="timestamp"
                stroke="#484f58"
                tick={{ fill: '#7d8590', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: '#30363d' }}
                interval="preserveStartEnd"
                minTickGap={20}
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
                formatter={(value: unknown, name: unknown) => [
                  `LSN ${value}`,
                  String(name),
                ]}
              />
              <Legend
                wrapperStyle={{
                  paddingTop: '8px',
                  fontSize: '11px',
                  color: '#c9d1d9',
                }}
              />
              {/* Primary Head Line */}
              <Line
                type="monotone"
                dataKey="primaryLsn"
                name="Primary Head (Leader)"
                stroke="#58a6ff"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              {/* Follower Lines */}
              {replicaNodeIds.map((nodeId, index) => {
                const color = FOLLOWER_COLORS[index % FOLLOWER_COLORS.length]
                const replicaInfo = replicas.find((r) => r.node_id === nodeId)
                const label = replicaInfo?.name
                  ? `${replicaInfo.name} Applied`
                  : `${nodeId} Applied`

                return (
                  <Line
                    key={nodeId}
                    type="monotone"
                    dataKey={`${nodeId}_applied`}
                    name={label}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                    isAnimationActive={false}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
