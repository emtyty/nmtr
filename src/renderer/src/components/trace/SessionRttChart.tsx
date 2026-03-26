import React, { useState } from 'react'
import {
  LineChart,
  Line,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'

interface SessionRttChartProps {
  rttHistory: (number | null)[]
  target: string
}

interface ChartPoint {
  i: number
  rtt: number | null
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number | null }> }): React.JSX.Element | null {
  if (!active || !payload?.[0]) return null
  const val = payload[0].value
  if (val === null) return null
  return (
    <div className="bg-canvas-subtle border border-border-default rounded px-2 py-1 text-xs text-fg-default">
      {val.toFixed(1)} ms
    </div>
  )
}

function rttColor(rtt: number): string {
  if (rtt < 50) return '#3fb950'
  if (rtt < 150) return '#d29922'
  return '#f85149'
}

export function SessionRttChart({ rttHistory, target }: SessionRttChartProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  const points: ChartPoint[] = rttHistory.map((rtt, i) => ({ i, rtt }))
  const validValues = rttHistory.filter((v): v is number => v !== null)
  const latest = validValues[validValues.length - 1] ?? null
  const avg = validValues.length > 0
    ? validValues.reduce((a, b) => a + b, 0) / validValues.length
    : null

  const lineColor = latest !== null ? rttColor(latest) : '#58a6ff'

  return (
    <div className="flex-shrink-0 border-b border-border-muted">
      {/* Header bar */}
      <button
        className="w-full flex items-center gap-2 px-3 py-1 text-xs text-fg-muted hover:text-fg-default hover:bg-canvas-hover transition-colors select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="font-semibold uppercase tracking-wider">RTT — {target}</span>
        {latest !== null && (
          <span style={{ color: lineColor }} className="font-semibold">
            {latest.toFixed(1)} ms
          </span>
        )}
        {avg !== null && (
          <span className="text-fg-subtle">avg {avg.toFixed(1)} ms</span>
        )}
        <span className="ml-auto">{collapsed ? '▶' : '▼'}</span>
      </button>

      {/* Chart */}
      {!collapsed && (
        <div className="h-14 px-1 pb-1">
          {points.length < 2 ? (
            <div className="h-full flex items-center justify-center text-fg-subtle text-xs">
              Waiting for data…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 2, right: 4, left: 0, bottom: 2 }}>
                <YAxis domain={['auto', 'auto']} hide />
                {avg !== null && (
                  <ReferenceLine
                    y={avg}
                    stroke="#58a6ff"
                    strokeDasharray="3 3"
                    strokeOpacity={0.4}
                  />
                )}
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="rtt"
                  stroke={lineColor}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}
