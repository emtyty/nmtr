import React, { useEffect, useMemo, useState } from 'react'
import { useHistoryStore } from '../../store/useHistoryStore'
import { useTraceStore } from '../../store/useTraceStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { HistoryEntry } from '@shared/types'
import type { TraceConfig } from '@shared/types'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function LossBar({ loss }: { loss: number }): React.JSX.Element {
  const color = loss === 0 ? 'bg-accent-green' : loss < 5 ? 'bg-accent-yellow' : 'bg-accent-red'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-canvas-hover rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(loss, 100)}%` }} />
      </div>
      <span className={loss === 0 ? 'text-accent-green' : loss < 5 ? 'text-accent-yellow' : 'text-accent-red'}>
        {loss.toFixed(1)}%
      </span>
    </div>
  )
}

export function HistoryView(): React.JSX.Element {
  const { entries, load, remove, clear } = useHistoryStore()
  const { addSession, setActive } = useTraceStore()
  const { settings } = useSettingsStore()
  const [query, setQuery] = useState('')
  const [protocolFilter, setProtocolFilter] = useState<'all' | 'icmp' | 'udp' | 'tcp'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'target' | 'duration' | 'loss' | 'rtt' | 'hops'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [rerunningId, setRerunningId] = useState<string | null>(null)

  // Always reload from main process when view mounts so we pick up
  // entries saved while the user was on the Traces view
  useEffect(() => { load() }, [])

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()

    const filtered = entries.filter((entry) => {
      if (protocolFilter !== 'all' && entry.protocol !== protocolFilter) return false
      if (!q) return true
      return entry.target.toLowerCase().includes(q)
    })

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'date') cmp = a.startedAt - b.startedAt
      else if (sortBy === 'target') cmp = a.target.localeCompare(b.target)
      else if (sortBy === 'duration') cmp = a.durationMs - b.durationMs
      else if (sortBy === 'loss') cmp = a.avgLoss - b.avgLoss
      else if (sortBy === 'rtt') cmp = (a.avgRtt ?? Number.MAX_SAFE_INTEGER) - (b.avgRtt ?? Number.MAX_SAFE_INTEGER)
      else if (sortBy === 'hops') cmp = a.hopCount - b.hopCount
      return sortDir === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [entries, protocolFilter, query, sortBy, sortDir])

  async function rerunEntry(entry: HistoryEntry): Promise<void> {
    setRerunningId(entry.id)
    try {
      const config: TraceConfig = {
        target: entry.target,
        protocol: entry.protocol,
        intervalMs: settings.defaultIntervalMs,
        packetSize: settings.defaultPacketSize,
        maxHops: settings.maxHops,
        useIPv6: false,
        resolveHostnames: settings.resolveHostnames
      }
      const result = await window.nmtrAPI.traceStart({ config })
      addSession(result.sessionId, config, result.engineMode as 'pingus' | 'native')
      setActive(result.sessionId)
    } catch (err) {
      console.error('Failed to rerun trace from history:', err)
    } finally {
      setRerunningId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-default flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-fg-default">Trace History</h2>
          <p className="text-sm text-fg-muted mt-0.5">{entries.length} session{entries.length !== 1 ? 's' : ''} recorded</p>
        </div>
        {entries.length > 0 && (
          <button
            className="text-sm px-3 py-1.5 rounded border border-border-default text-fg-muted hover:border-accent-red hover:text-accent-red transition-colors"
            onClick={clear}
            title="Clear all history"
          >
            Clear All
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="px-5 py-2 border-b border-border-default bg-canvas-default flex items-center gap-2 flex-wrap">
          <input
            className="bg-canvas-default border border-border-default rounded px-2.5 py-1.5 text-sm text-fg-default outline-none focus:border-accent-blue w-64"
            placeholder="Search target..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="bg-canvas-default border border-border-default rounded px-2.5 py-1.5 text-sm text-fg-default outline-none"
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value as 'all' | 'icmp' | 'udp' | 'tcp')}
          >
            <option value="all">All Protocols</option>
            <option value="icmp">ICMP</option>
            <option value="udp">UDP</option>
            <option value="tcp">TCP</option>
          </select>
          <select
            className="bg-canvas-default border border-border-default rounded px-2.5 py-1.5 text-sm text-fg-default outline-none"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'target' | 'duration' | 'loss' | 'rtt' | 'hops')}
          >
            <option value="date">Sort: Date</option>
            <option value="target">Sort: Target</option>
            <option value="duration">Sort: Duration</option>
            <option value="loss">Sort: Loss</option>
            <option value="rtt">Sort: RTT</option>
            <option value="hops">Sort: Hops</option>
          </select>
          <button
            className="text-sm px-2.5 py-1.5 rounded border border-border-default text-fg-muted hover:text-fg-default transition-colors"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDir === 'asc' ? 'Asc' : 'Desc'}
          </button>
          <span className="ml-auto text-xs text-fg-muted">
            Showing {filteredEntries.length} of {entries.length}
          </span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-fg-muted">
          <div className="text-5xl opacity-20">🕐</div>
          <div>
            <p className="text-base font-medium text-fg-subtle mb-1">No history yet</p>
            <p className="text-sm">Completed traces will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-base">
            <thead className="sticky top-0 bg-canvas-subtle border-b border-border-default z-10">
              <tr className="text-fg-muted font-semibold uppercase tracking-wider text-sm">
                <th className="text-left px-5 py-2.5 w-48">Target</th>
                <th className="text-left px-3 py-2.5 w-24">Date</th>
                <th className="text-left px-3 py-2.5 w-20">Duration</th>
                <th className="text-left px-3 py-2.5 w-16">Protocol</th>
                <th className="text-left px-3 py-2.5 w-14">Hops</th>
                <th className="text-left px-3 py-2.5 w-32">Avg Loss</th>
                <th className="text-left px-3 py-2.5 w-24">Final RTT</th>
                <th className="text-left px-3 py-2.5 w-16">Engine</th>
                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry: HistoryEntry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border-muted hover:bg-canvas-hover transition-colors group"
                >
                  <td className="px-5 py-2.5 font-medium text-fg-default font-mono truncate max-w-0">
                    {entry.target}
                  </td>
                  <td className="px-3 py-2.5 text-fg-muted whitespace-nowrap">
                    {formatDate(entry.startedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-fg-muted tabular-nums">
                    {formatDuration(entry.durationMs)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="px-1.5 py-0.5 rounded text-sm font-medium uppercase bg-canvas-hover text-fg-muted">
                      {entry.protocol}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-fg-default tabular-nums">{entry.hopCount}</td>
                  <td className="px-3 py-2.5">
                    <LossBar loss={entry.avgLoss} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-fg-default">
                    {entry.avgRtt !== null ? `${entry.avgRtt.toFixed(1)} ms` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-fg-subtle">{entry.engineMode}</td>
                  <td className="px-3 py-2.5">
                    <button
                      className="text-xs px-2 py-0.5 rounded border border-border-default text-fg-muted hover:text-fg-default hover:border-fg-muted transition-colors mr-2"
                      onClick={() => rerunEntry(entry)}
                      disabled={rerunningId === entry.id}
                      title="Start a new trace using this entry's target"
                    >
                      {rerunningId === entry.id ? 'Starting...' : 'Rerun'}
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-fg-subtle hover:text-accent-red transition-colors leading-none"
                      onClick={() => remove(entry.id)}
                      title="Remove entry"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
