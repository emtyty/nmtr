import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { SslScanRecord, SslScanResult, SslDiff, SslWatchEntry } from '../../shared/types'

interface SslStoreSchema {
  records: SslScanRecord[]
  watchlist: SslWatchEntry[]
}

// Lazy init — defers the sync file read out of the startup path.
let _store: Store<SslStoreSchema> | null = null
function store(): Store<SslStoreSchema> {
  if (!_store) {
    _store = new Store<SslStoreSchema>({
      name: 'nmtr-ssl',
      defaults: { records: [], watchlist: [] }
    })
  }
  return _store
}

const MAX_RECORDS = 100

function enabledProtocols(result: SslScanResult): string[] {
  return result.protocols.filter((p) => p.support === 'enabled').map((p) => p.protocol)
}

/** Diff a fresh result against a prior scan of the same endpoint. */
function diffResults(prev: SslScanResult, next: SslScanResult, previousAt: number): SslDiff {
  const beforeProtos = new Set(enabledProtocols(prev))
  const afterProtos = new Set(enabledProtocols(next))
  const protocolChanges: string[] = []
  for (const p of afterProtos) if (!beforeProtos.has(p)) protocolChanges.push(`${p} now enabled`)
  for (const p of beforeProtos) if (!afterProtos.has(p)) protocolChanges.push(`${p} now disabled`)

  const prevFp = prev.certificate?.sha256Fingerprint ?? ''
  const nextFp = next.certificate?.sha256Fingerprint ?? ''

  return {
    previousScanAt: previousAt,
    gradeChanged: prev.grade !== next.grade ? { from: prev.grade, to: next.grade } : null,
    certChanged: prevFp !== '' && nextFp !== '' && prevFp !== nextFp,
    protocolChanges
  }
}

const sameEndpoint = (r: SslScanRecord, result: SslScanResult): boolean =>
  r.host === result.host && r.ip === result.ip && r.port === result.port

const sameWatch = (w: SslWatchEntry, e: { host: string; ip: string; port: number }): boolean =>
  w.host === e.host && w.ip === e.ip && w.port === e.port

/** Refresh any watchlist entry matching this result with the freshest scan data. */
function refreshWatch(records: SslWatchEntry[], result: SslScanResult): SslWatchEntry[] {
  return records.map((w) =>
    sameWatch(w, result)
      ? {
          ...w,
          lastGrade: result.grade,
          lastScannedAt: Date.now(),
          certValidTo: result.certificate?.validTo ?? w.certValidTo,
          certSubject: result.certificate?.subject ?? w.certSubject
        }
      : w
  )
}

export const SslStore = {
  getAll(): SslScanRecord[] {
    return store().get('records')
  },

  clear(): void {
    store().set('records', [])
  },

  remove(id: string): void {
    const s = store()
    s.set('records', s.get('records').filter((r) => r.id !== id))
  },

  /**
   * Diff a completed scan against the most recent prior scan of the same
   * endpoint, then persist it (newest first). Returns the diff.
   */
  commit(result: SslScanResult): SslDiff {
    const s = store()
    const records = s.get('records')
    const prior = records.find((r) => sameEndpoint(r, result))

    const diff: SslDiff = prior?.result
      ? diffResults(prior.result, result, prior.scannedAt)
      : { previousScanAt: null, gradeChanged: null, certChanged: false, protocolChanges: [] }

    const record: SslScanRecord = {
      id: randomUUID(),
      host: result.host,
      ip: result.ip,
      port: result.port,
      grade: result.grade,
      scannedAt: Date.now(),
      durationMs: result.durationMs,
      certSubject: result.certificate?.subject ?? null,
      certValidTo: result.certificate?.validTo ?? null,
      result
    }
    records.unshift(record)
    if (records.length > MAX_RECORDS) records.splice(MAX_RECORDS)
    s.set('records', records)

    // Keep any watchlist entry for this endpoint in sync with the latest scan.
    s.set('watchlist', refreshWatch(s.get('watchlist'), result))

    return diff
  },

  // ── Watchlist ──────────────────────────────────────────────────────────────

  watchGetAll(): SslWatchEntry[] {
    return store().get('watchlist')
  },

  /** Add an endpoint to the watchlist (no-op if already watched). Returns the full list. */
  watchAdd(entry: { host: string; ip: string; port: number }, seed?: SslScanResult): SslWatchEntry[] {
    const s = store()
    const list = s.get('watchlist')
    if (list.some((w) => sameWatch(w, entry))) return list
    list.unshift({
      id: randomUUID(),
      host: entry.host,
      ip: entry.ip,
      port: entry.port,
      addedAt: Date.now(),
      lastGrade: seed?.grade ?? null,
      lastScannedAt: seed ? Date.now() : null,
      certValidTo: seed?.certificate?.validTo ?? null,
      certSubject: seed?.certificate?.subject ?? null
    })
    s.set('watchlist', list)
    return list
  },

  watchRemove(id: string): SslWatchEntry[] {
    const s = store()
    const list = s.get('watchlist').filter((w) => w.id !== id)
    s.set('watchlist', list)
    return list
  }
}
