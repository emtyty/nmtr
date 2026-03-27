import Store from 'electron-store'
import type { HistoryEntry } from '../../shared/types'

interface HistoryStoreSchema {
  entries: HistoryEntry[]
}

const store = new Store<HistoryStoreSchema>({
  name: 'nmtr-history',
  defaults: { entries: [] }
})

const MAX_ENTRIES = 200

export const HistoryStore = {
  getAll(): HistoryEntry[] {
    return store.get('entries')
  },

  add(entry: HistoryEntry): void {
    const entries = store.get('entries')
    entries.unshift(entry) // newest first
    if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES)
    store.set('entries', entries)
  },

  clear(): void {
    store.set('entries', [])
  },

  remove(id: string): void {
    const entries = store.get('entries').filter((e) => e.id !== id)
    store.set('entries', entries)
  }
}
