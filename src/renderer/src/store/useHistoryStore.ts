import { create } from 'zustand'
import type { HistoryEntry } from '@shared/types'

interface HistoryState {
  entries: HistoryEntry[]
  load: () => Promise<void>
  prependEntry: (entry: HistoryEntry) => void
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],

  // Always fetches fresh data from main process
  async load() {
    const entries = await window.nmtrAPI.historyGet()
    set({ entries })
  },

  // Called by the IPC push listener when a new entry is saved
  prependEntry(entry: HistoryEntry) {
    set((s) => ({ entries: [entry, ...s.entries] }))
  },

  async remove(id: string) {
    await window.nmtrAPI.historyRemove(id)
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
  },

  async clear() {
    await window.nmtrAPI.historyClear()
    set({ entries: [] })
  }
}))
