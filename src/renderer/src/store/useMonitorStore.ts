import { create } from 'zustand'
import type {
  MonitorView,
  MonitorIncident,
  MonitorResultEvent,
  MonitorAddPayload,
  MonitorUpdatePayload
} from '@shared/types'

interface MonitorState {
  monitors: MonitorView[]
  incidents: MonitorIncident[]
  loaded: boolean

  load: () => Promise<void>
  refreshIncidents: () => Promise<void>
  applyResult: (e: MonitorResultEvent) => void

  add: (payload: MonitorAddPayload) => Promise<void>
  update: (payload: MonitorUpdatePayload) => Promise<void>
  remove: (id: string) => Promise<void>
  runNow: (id: string) => Promise<void>
  clearHistory: (id: string) => Promise<void>
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  monitors: [],
  incidents: [],
  loaded: false,

  load: async () => {
    const [monitors, incidents] = await Promise.all([
      window.nmtrAPI.monitorList(),
      window.nmtrAPI.monitorIncidents()
    ])
    set({ monitors, incidents, loaded: true })
  },

  refreshIncidents: async () => {
    set({ incidents: await window.nmtrAPI.monitorIncidents() })
  },

  // Patch the matching monitor's stats in place from a pushed check result.
  applyResult: (e) => {
    set((state) => ({
      monitors: state.monitors.map((m) =>
        m.config.id === e.result.monitorId ? { ...m, stats: e.stats } : m
      )
    }))
  },

  add: async (payload) => {
    await window.nmtrAPI.monitorAdd(payload)
    await get().load()
  },

  update: async (payload) => {
    await window.nmtrAPI.monitorUpdate(payload)
    await get().load()
  },

  remove: async (id) => {
    await window.nmtrAPI.monitorRemove(id)
    await get().load()
  },

  runNow: async (id) => {
    await window.nmtrAPI.monitorRunNow(id)
    // Result arrives via the push subscription; no manual refresh needed.
  },

  clearHistory: async (id) => {
    await window.nmtrAPI.monitorClearHistory(id)
    await get().load()
  }
}))
