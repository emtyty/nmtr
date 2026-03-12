import React, { useState, useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import type { HopStats } from '@shared/types'

interface Props {
  hop: HopStats | null
  onClose: () => void
}

function fmtMs(v: number | null): string {
  if (v === null) return '—'
  return `${v.toFixed(1)} ms`
}

function latencyColor(avg: number | null): string {
  if (avg === null) return '#484f58'
  if (avg < 50) return '#3fb950'
  if (avg < 150) return '#d29922'
  return '#f85149'
}

export function LatencyDetailDialog({ hop, onClose }: Props): React.JSX.Element {
  // Snapshot updates at 1-second intervals — decoupled from the live store
  const [snapshot, setSnapshot] = useState<HopStats | null>(hop)
  const hopRef = useRef(hop)

  // Keep ref pointing to latest hop without triggering effects
  useEffect(() => {
    hopRef.current = hop
  })

  // Immediately show correct hop when dialog opens for a different hop
  useEffect(() => {
    setSnapshot(hop)
  }, [hop?.hopIndex])

  // 1-second tick — reads from ref so it always gets the freshest data
  useEffect(() => {
    if (!hop) return
    const id = setInterval(() => {
      if (hopRef.current) setSnapshot({ ...hopRef.current })
    }, 1000)
    return () => clearInterval(id)
  }, [!!hop]) // restart only when dialog opens/closes

  if (!snapshot) return <></>

  const chartData = snapshot.sparkline.map((v, i) => ({
    i,
    ms: v ?? undefined,
    lost: v === null ? 1 : 0
  }))
  const validCount = snapshot.sparkline.filter((v) => v !== null).length
  const color = latencyColor(snapshot.avg)

  const statItems = [
    { label: 'Last', value: fmtMs(snapshot.last) },
    { label: 'Avg', value: fmtMs(snapshot.avg) },
    { label: 'Best', value: fmtMs(snapshot.best) },
    { label: 'Worst', value: fmtMs(snapshot.worst) },
    { label: 'Jitter', value: fmtMs(snapshot.jitter) },
    { label: 'Loss', value: `${snapshot.loss.toFixed(1)}%` }
  ]

  return (
    <Dialog.Root open={!!hop} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas-subtle border border-border-default rounded-lg w-[700px] z-50 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between px-4 py-3 border-b border-border-default">
            <div>
              <Dialog.Title className="text-base font-semibold text-fg-default">
                Hop {snapshot.hopIndex} — Latency Detail
              </Dialog.Title>
              <p className="text-xs text-fg-muted mt-0.5 flex items-center gap-1.5">
                <span className="text-accent-blue">{snapshot.hostname ?? snapshot.ip ?? '* * *'}</span>
                {snapshot.hostname && snapshot.ip && (
                  <span className="text-fg-subtle">({snapshot.ip})</span>
                )}
                {snapshot.enrichment?.asn && (
                  <>
                    <span className="text-border-default">·</span>
                    <span>{snapshot.enrichment.asn}</span>
                  </>
                )}
                {snapshot.enrichment?.countryCode && (
                  <>
                    <span className="text-border-default">·</span>
                    <span>
                      {snapshot.enrichment.city ? `${snapshot.enrichment.city}, ` : ''}
                      {snapshot.enrichment.countryCode}
                    </span>
                  </>
                )}
              </p>
            </div>
            <Dialog.Close asChild>
              <button className="text-fg-muted hover:text-fg-default text-xl leading-none mt-0.5">×</button>
            </Dialog.Close>
          </div>

          {/* Chart */}
          <div className="px-4 pt-5 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="i" hide />
                <YAxis
                  yAxisId="ms"
                  width={52}
                  tick={{ fontSize: 11, fill: '#8b949e' }}
                  tickFormatter={(v) => `${v}ms`}
                  domain={['auto', 'auto']}
                />
                <YAxis yAxisId="loss" domain={[0, 1]} hide />
                <Tooltip
                  contentStyle={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: 6,
                    fontSize: 12
                  }}
                  formatter={(v: number, name: string) =>
                    name === 'lost' ? null : [`${v.toFixed(1)} ms`, 'RTT']
                  }
                  labelFormatter={(i: number) => `Sample ${i + 1}`}
                />
                {snapshot.avg !== null && (
                  <ReferenceLine
                    yAxisId="ms"
                    y={snapshot.avg}
                    stroke="#58a6ff"
                    strokeDasharray="4 2"
                    label={{ value: 'avg', fill: '#58a6ff', fontSize: 10, position: 'insideTopRight' }}
                  />
                )}
                <Bar
                  yAxisId="loss"
                  dataKey="lost"
                  fill="#f85149"
                  opacity={0.3}
                  isAnimationActive={false}
                  barSize={8}
                />
                <Line
                  yAxisId="ms"
                  type="monotone"
                  dataKey="ms"
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-6 border-t border-border-default">
            {statItems.map(({ label, value }, i) => (
              <div
                key={label}
                className={`px-3 py-3 text-center ${i < statItems.length - 1 ? 'border-r border-border-default' : ''}`}
              >
                <div className="text-xs text-fg-muted">{label}</div>
                <div className="text-sm font-semibold text-fg-default mt-1">{value}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border-default flex items-center gap-2 text-xs text-fg-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green pulse-dot flex-shrink-0" />
            Updates every 1s · {validCount} of 60 samples collected
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
