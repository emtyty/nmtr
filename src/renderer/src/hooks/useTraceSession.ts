import { useEffect, useRef, startTransition } from 'react'
import { useTraceStore } from '../store/useTraceStore'
import { useRecordingStore } from '../store/useRecordingStore'
import type { HopStats } from '@shared/types'

/**
 * Subscribe to all IPC push events from the main process
 * and feed them into the Zustand store.
 * Mount this once at the App root level.
 *
 * CRITICAL: Uses useTraceStore.getState() instead of useTraceStore() to avoid
 * creating a store subscription here. If we called useTraceStore(), App would
 * re-render on every store update, cascading re-renders to the entire tree.
 */

const THROTTLE_MS = 300 // ~3 UI updates/sec for hop data

export function useTraceSession(): void {
  const pendingRef = useRef<Record<string, HopStats[]>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function flushPending(): void {
      timerRef.current = null
      const pending = pendingRef.current
      if (Object.keys(pending).length === 0) return
      pendingRef.current = {}
      startTransition(() => {
        const { batchUpdateHops } = useTraceStore.getState()
        for (const [sessionId, hops] of Object.entries(pending)) {
          batchUpdateHops(sessionId, hops)
        }
      })
    }

    const unsubs = [
      window.nmtrAPI.onHopUpdate((e) => {
        startTransition(() => useTraceStore.getState().updateHop(e.sessionId, e.hopStats))
      }),
      window.nmtrAPI.onHopsBatch((e) => {
        pendingRef.current[e.sessionId] = e.hops
        if (!timerRef.current) {
          timerRef.current = setTimeout(flushPending, THROTTLE_MS)
        }
      }),
      window.nmtrAPI.onHopNew((e) => {
        useTraceStore.getState().addHop(e.sessionId, e.hopIndex, e.ip)
      }),
      window.nmtrAPI.onDnsResolved((e) => {
        useTraceStore.getState().updateHostname(e.sessionId, e.hopIndex, e.hostname)
      }),
      window.nmtrAPI.onHopEnriched((e) => {
        useTraceStore.getState().updateEnrichment(e.sessionId, e.hopIndex, e.enrichment)
      }),
      window.nmtrAPI.onSessionStatus((e) => {
        useTraceStore.getState().updateStatus(e.sessionId, e.status, e.elapsedMs, e.totalSent)
      }),
      window.nmtrAPI.onPlaybackFrame((e) => {
        const s = useTraceStore.getState()
        s.replaceAllHops(e.sessionId, e.frame.hops)
        s.updateStatus(e.sessionId, 'running', e.frame.t, 0)
        const rec = useRecordingStore.getState()
        rec.updatePlaybackPosition(e.frame.t)
        // Auto-stop playing state when last frame arrives
        if (e.frameIndex >= e.frameCount - 1) {
          rec.setPlaying(false)
        }
      })
    ]

    return () => {
      unsubs.forEach((u) => u())
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])
}
