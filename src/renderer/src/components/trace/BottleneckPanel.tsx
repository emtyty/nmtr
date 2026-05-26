import React, { useState } from 'react'
import type { HopStats } from '@shared/types'

interface BottleneckPanelProps {
  hops: HopStats[]
  bottleneckInfo: { hopIndex: number; delta: number } | null
}

export function BottleneckPanel({ hops, bottleneckInfo }: BottleneckPanelProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(true)

  if (!bottleneckInfo) return null

  const hop = hops.find((h) => h.hopIndex === bottleneckInfo.hopIndex) ?? null
  const hostDisplay = hop?.hostname ?? hop?.ip ?? '—'

  return (
    <div className="flex-1 min-w-0 border-l border-border-default bg-canvas-subtle">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 h-9 text-sm font-semibold text-fg-muted hover:text-fg-default hover:bg-canvas-hover transition-colors select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-accent-yellow text-xs">▶</span>
        <span>Bottleneck Detection</span>
        <span className="ml-auto text-xs text-fg-subtle">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Detail */}
      {expanded && (
        <div className="overflow-y-auto max-h-40 font-table text-sm">
          <div className="flex items-center gap-3 px-3 py-1 border-t border-border-muted hover:bg-canvas-hover">
            <span className="text-fg-muted shrink-0">
              Hop <span className="text-fg-default font-medium">{bottleneckInfo.hopIndex}</span>
            </span>
            <span className="text-accent-yellow tabular-nums shrink-0" title="Latency increase vs previous responsive hop">
              +{bottleneckInfo.delta.toFixed(1)} ms
            </span>
            <span className="text-accent-blue truncate" title={hop?.ip ?? undefined}>
              {hostDisplay}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
