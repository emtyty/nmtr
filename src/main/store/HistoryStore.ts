import Store from 'electron-store'
import type { HistoryEntry } from '../../shared/types'

interface HistoryStoreSchema {
  entries: HistoryEntry[]
}

// Lazy init — defers the sync file read out of the startup path.
// First history op (typically TRACE_STOP) pays the cost, not cold start.
let _store: Store<HistoryStoreSchema> | null = null
function store(): Store<HistoryStoreSchema> {
  if (!_store) {
    _store = new Store<HistoryStoreSchema>({
      name: 'nmtr-history',
      defaults: { entries: [] }
    })
  }
  return _store
}

const MAX_ENTRIES = 200

export const HistoryStore = {
  getAll(): HistoryEntry[] {
    return store().get('entries')
  },

  add(entry: HistoryEntry): void {
    const s = store()
    const entries = s.get('entries')
    entries.unshift(entry) // newest first
    if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES)
    s.set('entries', entries)
  },

  clear(): void {
    store().set('entries', [])
  },

  remove(id: string): void {
    const s = store()
    const entries = s.get('entries').filter((e) => e.id !== id)
    s.set('entries', entries)
  }
}
