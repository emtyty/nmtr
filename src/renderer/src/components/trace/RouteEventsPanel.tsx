import React, { useState } from 'react'
import type { RouteChangeEvent } from '@shared/types'

interface RouteEventsPanelProps {
  events: RouteChangeEvent[]
  sessionStartedAt: number
}

function formatElapsed(timestamp: number, startedAt: number): string {
  const ms = Math.max(0, timestamp - startedAt)
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function RouteEventsPanel({ events, sessionStartedAt }: RouteEventsPanelProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(true)

  if (events.length === 0) return null

  // Newest first
  const sorted = [...events].reverse()

  return (
    <div className="flex-shrink-0 border-t border-border-default bg-canvas-subtle">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 h-9 text-sm font-semibold text-fg-muted hover:text-fg-default hover:bg-canvas-hover transition-colors select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-accent-orange text-xs">▲</span>
        <span>Route Events ({events.length})</span>
        <span className="ml-auto text-xs text-fg-subtle">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Event list */}
      {expanded && (
        <div className="overflow-y-auto max-h-40 font-table text-sm">
          {sorted.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-1 border-t border-border-muted hover:bg-canvas-hover"
            >
              <span className="text-fg-subtle tabular-nums shrink-0">
                {formatElapsed(e.timestamp, sessionStartedAt)}
              </span>
              <span className="text-fg-muted shrink-0">
                Hop{' '}
                <span className="text-fg-default font-medium">{e.hopIndex}</span>
              </span>
              <span className="text-fg-subtle truncate">
                <span className="text-accent-blue">{e.oldIP}</span>
                <span className="mx-1 text-fg-subtle">→</span>
                <span className="text-accent-orange">{e.newIP}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
