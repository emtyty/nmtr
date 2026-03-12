import React from 'react'
import type { TraceSession } from '@shared/types'

interface StatusBarProps {
  session: TraceSession | null
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export function StatusBar({ session }: StatusBarProps): React.JSX.Element {
  if (!session) {
    return (
      <div className="h-6 bg-canvas-subtle border-t border-border-default flex items-center px-4 text-sm text-fg-muted">
        No active trace
      </div>
    )
  }

  const avgLoss =
    session.hops.length > 0
      ? session.hops.reduce((s, h) => s + h.loss, 0) / session.hops.length
      : 0

  const avgRtt =
    session.hops.filter((h) => h.avg !== null).length > 0
      ? session.hops
          .filter((h) => h.avg !== null)
          .reduce((s, h) => s + h.avg!, 0) /
        session.hops.filter((h) => h.avg !== null).length
      : null

  return (
    <div className="h-6 bg-canvas-subtle border-t border-border-default flex items-center px-4 gap-4 text-sm text-fg-muted flex-shrink-0">
      <span className="text-fg-default">● {session.config.target}</span>
      <span className="w-px h-3 bg-border-default" />
      <span>{session.hops.length} hops</span>
      <span className="w-px h-3 bg-border-default" />
      {avgRtt !== null && <span>Avg latency: {avgRtt.toFixed(1)}ms</span>}
      <span className="w-px h-3 bg-border-default" />
      <span>Packet loss: {avgLoss.toFixed(1)}%</span>
      <span className="w-px h-3 bg-border-default" />
      {session.engineMode === 'native' && (
        <>
          <span className="text-accent-yellow">⚠ Limited mode (no admin)</span>
          <span className="w-px h-3 bg-border-default" />
        </>
      )}
      <span className="ml-auto">
        {session.status === 'running' ? `Elapsed: ${formatElapsed(session.elapsedMs)}` : session.status}
      </span>
    </div>
  )
}
