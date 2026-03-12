import { create } from 'zustand'
import { randomUUID } from 'crypto'
import type {
  TraceSession,
  TraceConfig,
  HopStats,
  SessionStatus,
  EnrichmentData
} from '@shared/types'

interface TraceState {
  sessions: Record<string, TraceSession>
  activeSessionId: string | null

  // Actions
  addSession: (id: string, config: TraceConfig, engineMode: 'pingus' | 'native') => void
  removeSession: (id: string) => void
  setActive: (id: string) => void
  updateHop: (sessionId: string, hopStats: HopStats) => void
  batchUpdateHops: (sessionId: string, hops: HopStats[]) => void
  addHop: (sessionId: string, hopIndex: number, ip: string) => void
  updateHostname: (sessionId: string, hopIndex: number, hostname: string) => void
  updateEnrichment: (sessionId: string, hopIndex: number, enrichment: EnrichmentData) => void
  updateStatus: (sessionId: string, status: SessionStatus, elapsedMs: number, totalSent: number) => void
  replaceAllHops: (sessionId: string, hops: HopStats[]) => void
  addPlaybackSession: (id: string, config: TraceConfig) => void
}

export const useTraceStore = create<TraceState>((set) => ({
  sessions: {},
  activeSessionId: null,

  addSession: (id, config, engineMode) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: {
          id,
          config,
          status: 'running',
          hops: [],
          startedAt: Date.now(),
          elapsedMs: 0,
          totalSent: 0,
          isPlayback: false,
          engineMode
        }
      },
      activeSessionId: id
    })),

  removeSession: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.sessions
      const ids = Object.keys(rest)
      return {
        sessions: rest,
        activeSessionId:
          state.activeSessionId === id ? (ids[ids.length - 1] ?? null) : state.activeSessionId
      }
    }),

  setActive: (id) => set({ activeSessionId: id }),

  updateHop: (sessionId, hopStats) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      const idx = session.hops.findIndex((h) => h.hopIndex === hopStats.hopIndex)
      const newHops =
        idx >= 0
          ? session.hops.map((h, i) => (i === idx ? hopStats : h))
          : [...session.hops, hopStats].sort((a, b) => a.hopIndex - b.hopIndex)
      return { sessions: { ...state.sessions, [sessionId]: { ...session, hops: newHops } } }
    }),

  // Replace all hops from a probe-round batch in one state update (avoids N re-renders)
  batchUpdateHops: (sessionId, hops) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      // Merge: existing hops keep enrichment/hostname if batch entry has none (DNS/enrichment arrive separately)
      const hopMap = new Map(session.hops.map((h) => [h.hopIndex, h]))
      for (const h of hops) {
        const existing = hopMap.get(h.hopIndex)
        hopMap.set(h.hopIndex, {
          ...h,
          hostname: h.hostname ?? existing?.hostname ?? null,
          enrichment: h.enrichment ?? existing?.enrichment ?? null
        })
      }
      const newHops = Array.from(hopMap.values()).sort((a, b) => a.hopIndex - b.hopIndex)
      return { sessions: { ...state.sessions, [sessionId]: { ...session, hops: newHops } } }
    }),

  addHop: (sessionId, hopIndex, ip) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      const exists = session.hops.some((h) => h.hopIndex === hopIndex)
      if (exists) return state
      const newHop: HopStats = {
        hopIndex,
        ip,
        hostname: null,
        enrichment: null,
        loss: 0,
        sent: 0,
        recv: 0,
        last: null,
        avg: null,
        best: null,
        worst: null,
        jitter: null,
        sparkline: new Array(60).fill(null)
      }
      const newHops = [...session.hops, newHop].sort((a, b) => a.hopIndex - b.hopIndex)
      return { sessions: { ...state.sessions, [sessionId]: { ...session, hops: newHops } } }
    }),

  updateHostname: (sessionId, hopIndex, hostname) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      const newHops = session.hops.map((h) =>
        h.hopIndex === hopIndex ? { ...h, hostname } : h
      )
      return { sessions: { ...state.sessions, [sessionId]: { ...session, hops: newHops } } }
    }),

  updateEnrichment: (sessionId, hopIndex, enrichment) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      const newHops = session.hops.map((h) =>
        h.hopIndex === hopIndex ? { ...h, enrichment } : h
      )
      return { sessions: { ...state.sessions, [sessionId]: { ...session, hops: newHops } } }
    }),

  updateStatus: (sessionId, status, elapsedMs, totalSent) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      return {
        sessions: { ...state.sessions, [sessionId]: { ...session, status, elapsedMs, totalSent } }
      }
    }),

  replaceAllHops: (sessionId, hops) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      return { sessions: { ...state.sessions, [sessionId]: { ...session, hops } } }
    }),

  addPlaybackSession: (id, config) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: {
          id,
          config,
          status: 'paused',
          hops: [],
          startedAt: Date.now(),
          elapsedMs: 0,
          totalSent: 0,
          isPlayback: true,
          engineMode: 'native'
        }
      },
      activeSessionId: id
    }))
}))
