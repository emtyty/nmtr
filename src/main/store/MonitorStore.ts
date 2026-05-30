/**
 * Persistence for the Monitors feature.
 *
 * Holds three collections in one electron-store file:
 *   • configs   — the user's monitor definitions
 *   • results   — a bounded rolling log of check outcomes (per monitor)
 *   • incidents — open/closed down-time events for the timeline
 *
 * Stats (uptime %, average latency, sparkline) are derived on demand from the
 * rolling result log rather than stored, so they always reflect the retention
 * window without a migration.
 */
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type {
  MonitorConfig,
  MonitorResult,
  MonitorIncident,
  MonitorStats,
  MonitorStatus,
  MonitorView
} from '../../shared/types'

interface MonitorStoreSchema {
  configs: MonitorConfig[]
  results: MonitorResult[]    // flat log across all monitors, newest-last
  incidents: MonitorIncident[]
}

let _store: Store<MonitorStoreSchema> | null = null
function store(): Store<MonitorStoreSchema> {
  if (!_store) {
    _store = new Store<MonitorStoreSchema>({
      name: 'nmtr-monitor',
      defaults: { configs: [], incidents: [], results: [] }
    })
  }
  return _store
}

// Keep at most this many results per monitor, and never older than the window.
const MAX_RESULTS_PER_MONITOR = 500
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const SPARKLINE_POINTS = 60

// ── Stats derivation ──────────────────────────────────────────────────────────

function computeStats(monitorId: string, results: MonitorResult[]): MonitorStats {
  const mine = results.filter((r) => r.monitorId === monitorId)
  if (mine.length === 0) {
    return {
      status: 'unknown', lastCheckedAt: null, lastLatencyMs: null, lastMessage: null,
      uptime24hPct: null, avgLatency24hMs: null, checks24h: 0, recent: []
    }
  }
  const last = mine[mine.length - 1]
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const window = mine.filter((r) => r.checkedAt >= cutoff)
  const ups = window.filter((r) => r.status === 'up' || r.status === 'degraded').length
  const latencies = window.map((r) => r.latencyMs).filter((v): v is number => v !== null)

  return {
    status: last.status,
    lastCheckedAt: last.checkedAt,
    lastLatencyMs: last.latencyMs,
    lastMessage: last.message,
    uptime24hPct: window.length > 0 ? Math.round((ups / window.length) * 1000) / 10 : null,
    avgLatency24hMs: latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null,
    checks24h: window.length,
    recent: mine.slice(-SPARKLINE_POINTS)
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const MonitorStore = {
  getConfigs(): MonitorConfig[] {
    return store().get('configs')
  },

  getConfig(id: string): MonitorConfig | undefined {
    return store().get('configs').find((c) => c.id === id)
  },

  /** Configs joined with their derived stats — what the renderer lists. */
  listWithStats(): MonitorView[] {
    const s = store()
    const results = s.get('results')
    return s.get('configs').map((config) => ({ config, stats: computeStats(config.id, results) }))
  },

  stats(monitorId: string): MonitorStats {
    return computeStats(monitorId, store().get('results'))
  },

  add(partial: Omit<MonitorConfig, 'id' | 'createdAt'>): MonitorConfig {
    const s = store()
    const config: MonitorConfig = { ...partial, id: randomUUID(), createdAt: Date.now() }
    const configs = s.get('configs')
    configs.push(config)
    s.set('configs', configs)
    return config
  },

  update(id: string, patch: Partial<Omit<MonitorConfig, 'id' | 'createdAt'>>): MonitorConfig | undefined {
    const s = store()
    const configs = s.get('configs')
    const idx = configs.findIndex((c) => c.id === id)
    if (idx === -1) return undefined
    configs[idx] = { ...configs[idx], ...patch }
    s.set('configs', configs)
    return configs[idx]
  },

  remove(id: string): void {
    const s = store()
    s.set('configs', s.get('configs').filter((c) => c.id !== id))
    s.set('results', s.get('results').filter((r) => r.monitorId !== id))
    s.set('incidents', s.get('incidents').filter((i) => i.monitorId !== id))
  },

  clearHistory(id: string): void {
    const s = store()
    s.set('results', s.get('results').filter((r) => r.monitorId !== id))
    s.set('incidents', s.get('incidents').filter((i) => i.monitorId !== id))
  },

  /** Append a result, prune old/excess rows, and return fresh stats. */
  addResult(result: MonitorResult): MonitorStats {
    const s = store()
    let results = s.get('results')
    results.push(result)

    // Prune by age, then cap per-monitor count (keep newest).
    const cutoff = Date.now() - RETENTION_MS
    results = results.filter((r) => r.checkedAt >= cutoff)
    const counts = new Map<string, number>()
    // Walk newest→oldest, dropping anything beyond the cap for its monitor.
    const kept: MonitorResult[] = []
    for (let i = results.length - 1; i >= 0; i--) {
      const r = results[i]
      const n = (counts.get(r.monitorId) ?? 0) + 1
      counts.set(r.monitorId, n)
      if (n <= MAX_RESULTS_PER_MONITOR) kept.push(r)
    }
    kept.reverse()
    s.set('results', kept)

    return computeStats(result.monitorId, kept)
  },

  // ── Incidents ────────────────────────────────────────────────────────────

  getIncidents(): MonitorIncident[] {
    // Newest first for the timeline.
    return store().get('incidents').slice().sort((a, b) => b.startedAt - a.startedAt)
  },

  /** Open a new incident when a monitor transitions into a failing state. */
  openIncident(monitorId: string, status: MonitorStatus, reason: string | null): MonitorIncident {
    const s = store()
    const incidents = s.get('incidents')
    const incident: MonitorIncident = {
      id: randomUUID(), monitorId, startedAt: Date.now(), resolvedAt: null, status, reason
    }
    incidents.push(incident)
    if (incidents.length > 500) incidents.splice(0, incidents.length - 500)
    s.set('incidents', incidents)
    return incident
  },

  /** Close the most recent open incident for a monitor (on recovery). */
  resolveIncident(monitorId: string): void {
    const s = store()
    const incidents = s.get('incidents')
    for (let i = incidents.length - 1; i >= 0; i--) {
      if (incidents[i].monitorId === monitorId && incidents[i].resolvedAt === null) {
        incidents[i] = { ...incidents[i], resolvedAt: Date.now() }
        break
      }
    }
    s.set('incidents', incidents)
  }
}
