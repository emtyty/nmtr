import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { SslScanRecord, SslScanResult, SslDiff } from '../../shared/types'

interface SslStoreSchema {
  records: SslScanRecord[]
}

// Lazy init — defers the sync file read out of the startup path.
let _store: Store<SslStoreSchema> | null = null
function store(): Store<SslStoreSchema> {
  if (!_store) {
    _store = new Store<SslStoreSchema>({
      name: 'nmtr-ssl',
      defaults: { records: [] }
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

    return diff
  }
}
