import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { DnsHistoryRecord, DnsLookupResult, DnsDiff, DnsTypeDiff } from '../../shared/types'
import { DNS_RECORD_TYPES } from '../../shared/types'

interface DnsStoreSchema {
  records: DnsHistoryRecord[]
}

// Lazy init — defers the sync file read out of the startup path.
let _store: Store<DnsStoreSchema> | null = null
function store(): Store<DnsStoreSchema> {
  if (!_store) {
    _store = new Store<DnsStoreSchema>({
      name: 'nmtr-dns',
      defaults: { records: [] }
    })
  }
  return _store
}

const MAX_RECORDS = 100

function valuesByType(result: DnsLookupResult): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const set of result.sets) m.set(set.type, set.records.map((r) => r.value).sort())
  return m
}

/** Diff a fresh result against a prior one of the same target+resolver. */
function diffResults(prev: DnsLookupResult, next: DnsLookupResult, previousAt: number): DnsDiff {
  const before = valuesByType(prev)
  const after = valuesByType(next)
  const changes: DnsTypeDiff[] = []
  for (const type of DNS_RECORD_TYPES) {
    const b = before.get(type) ?? []
    const a = after.get(type) ?? []
    const added = a.filter((v) => !b.includes(v))
    const removed = b.filter((v) => !a.includes(v))
    if (added.length > 0 || removed.length > 0) changes.push({ type, added, removed })
  }
  return { previousAt, changes }
}

export const DnsStore = {
  getAll(): DnsHistoryRecord[] {
    return store().get('records')
  },

  clear(): void {
    store().set('records', [])
  },

  remove(id: string): void {
    const s = store()
    s.set('records', s.get('records').filter((r) => r.id !== id))
  },

  /** Most recent prior record for this target+resolver, if any. */
  lastFor(target: string, resolver: string): DnsHistoryRecord | undefined {
    return store().get('records').find((r) => r.target === target && r.resolver === resolver)
  },

  /** Diff a result against the most recent prior lookup of the same target+resolver. */
  diffAgainstLast(result: DnsLookupResult): DnsDiff | null {
    const prior = this.lastFor(result.target, result.resolver)
    if (!prior?.result) return null
    return diffResults(prior.result, result, prior.scannedAt)
  },

  /** Persist a completed lookup as a history record (newest first). Returns it. */
  commit(result: DnsLookupResult): DnsHistoryRecord {
    const s = store()
    const records = s.get('records')

    const typeCounts = result.sets
      .filter((set) => set.records.length > 0)
      .map((set) => ({ type: set.type, count: set.records.length }))

    const record: DnsHistoryRecord = {
      id: randomUUID(),
      target: result.target,
      queriedName: result.queriedName,
      resolver: result.resolver,
      scannedAt: Date.now(),
      totalRecords: typeCounts.reduce((n, t) => n + t.count, 0),
      typeCounts,
      durationMs: result.durationMs,
      result
    }
    records.unshift(record)
    if (records.length > MAX_RECORDS) records.splice(MAX_RECORDS)
    s.set('records', records)

    return record
  }
}
