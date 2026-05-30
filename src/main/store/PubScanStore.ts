import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { PubScanRecord, PubScanResult, PubScanDiff } from '../../shared/types'

interface PubScanStoreSchema {
  records: PubScanRecord[]
}

// Lazy init — defers the sync file read out of the startup path.
let _store: Store<PubScanStoreSchema> | null = null
function store(): Store<PubScanStoreSchema> {
  if (!_store) {
    _store = new Store<PubScanStoreSchema>({
      name: 'nmtr-pubscan',
      defaults: { records: [] }
    })
  }
  return _store
}

const MAX_RECORDS = 100

const sameTarget = (r: PubScanRecord, result: PubScanResult): boolean => r.domain === result.domain

/** Diff a fresh result against a prior scan of the same domain. */
function diffResults(prev: PubScanResult, next: PubScanResult, previousAt: number): PubScanDiff {
  const prevTitles = new Set(prev.findings.map((f) => f.title))
  const nextTitles = new Set(next.findings.map((f) => f.title))
  const newFindings = [...nextTitles].filter((t) => !prevTitles.has(t))
  const resolvedFindings = [...prevTitles].filter((t) => !nextTitles.has(t))
  return {
    previousScanAt: previousAt,
    gradeChanged: prev.grade !== next.grade ? { from: prev.grade, to: next.grade } : null,
    newFindings,
    resolvedFindings
  }
}

export const PubScanStore = {
  getAll(): PubScanRecord[] {
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
   * Diff a completed scan against the most recent prior scan of the same domain,
   * then persist it (newest first). Returns the diff.
   */
  commit(result: PubScanResult): PubScanDiff {
    const s = store()
    const records = s.get('records')
    const prior = records.find((r) => sameTarget(r, result))

    const diff: PubScanDiff = prior?.result
      ? diffResults(prior.result, result, prior.scannedAt)
      : { previousScanAt: null, gradeChanged: null, newFindings: [], resolvedFindings: [] }

    const record: PubScanRecord = {
      id: randomUUID(),
      domain: result.domain,
      url: result.finalUrl,
      grade: result.grade,
      scannedAt: Date.now(),
      durationMs: result.durationMs,
      findingCount: result.findings.length,
      result
    }
    records.unshift(record)
    if (records.length > MAX_RECORDS) records.splice(MAX_RECORDS)
    s.set('records', records)

    return diff
  }
}
