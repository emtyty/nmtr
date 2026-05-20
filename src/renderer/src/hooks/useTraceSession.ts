import { useEffect, useRef, startTransition } from 'react'
import { useTraceStore } from '../store/useTraceStore'
import { useRecordingStore } from '../store/useRecordingStore'
import { useUIStore } from '../store/useUIStore'
import { useHistoryStore } from '../store/useHistoryStore'
import { useSettingsStore } from '../store/useSettingsStore'
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
  const lastAlertRef = useRef<Record<string, number>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function notifyAlert(title: string, message: string): void {
      if (!('Notification' in window)) return
      if (Notification.permission === 'granted') {
        new Notification(title, { body: message })
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') new Notification(title, { body: message })
        }).catch(() => {})
      }
    }

    function maybeEmitSloAlerts(sessionId: string, hops: HopStats[]): void {
      const settings = useSettingsStore.getState().settings
      if (!settings.alertsEnabled) return

      const state = useTraceStore.getState()
      const session = state.sessions[sessionId]
      if (!session || session.status !== 'running' || session.isPlayback) return

      const cooldownMs = Math.max(5, settings.alertCooldownSec) * 1000
      const now = Date.now()

      const hopsWithTraffic = hops.filter((h) => h.sent > 0)
      if (hopsWithTraffic.length > 0) {
        const avgLoss = hopsWithTraffic.reduce((sum, h) => sum + h.loss, 0) / hopsWithTraffic.length
        const lossKey = `${sessionId}:loss`
        if (avgLoss >= settings.alertLossPct && now - (lastAlertRef.current[lossKey] ?? 0) >= cooldownMs) {
          lastAlertRef.current[lossKey] = now
          const title = 'Trace SLO alert: packet loss'
          const message = `${session.config.target} avg loss ${avgLoss.toFixed(1)}% >= ${settings.alertLossPct.toFixed(1)}%`
          useUIStore.getState().pushRuntimeAlert({
            id: `${lossKey}:${now}`,
            level: 'error',
            title,
            message
          })
          notifyAlert(title, message)
        }
      }

      const finalHop = [...hops].reverse().find((h) => h.last !== null)
      if (!finalHop || finalHop.last === null) return
      const rttKey = `${sessionId}:rtt`
      if (finalHop.last >= settings.alertRttMs && now - (lastAlertRef.current[rttKey] ?? 0) >= cooldownMs) {
        lastAlertRef.current[rttKey] = now
        const title = 'Trace SLO alert: latency'
        const message = `${session.config.target} last RTT ${finalHop.last.toFixed(1)}ms >= ${settings.alertRttMs.toFixed(1)}ms`
        useUIStore.getState().pushRuntimeAlert({
          id: `${rttKey}:${now}`,
          level: 'warn',
          title,
          message
        })
        notifyAlert(title, message)
      }
    }

    function flushPending(): void {
      timerRef.current = null
      const pending = pendingRef.current
      if (Object.keys(pending).length === 0) return
      pendingRef.current = {}
      startTransition(() => {
        const { batchUpdateHops } = useTraceStore.getState()
        for (const [sessionId, hops] of Object.entries(pending)) {
          batchUpdateHops(sessionId, hops)
          maybeEmitSloAlerts(sessionId, hops)
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
      }),
      // Route change events — not batched, dispatched immediately
      window.nmtrAPI.onHopRouteChanged((e) => {
        useTraceStore.getState().addRouteEvent(e.sessionId, e)
      }),
      window.nmtrAPI.onSessionReset((e) => {
        useTraceStore.getState().clearRouteEvents(e.sessionId)
      }),
      // Tracert discovery — store result silently; user opens modal manually via 📡 button
      window.nmtrAPI.onTracertResult((e) => {
        useUIStore.getState().showTracertResult(e)
      }),
      // History — prepend new entry immediately when a trace stops
      window.nmtrAPI.onHistoryEntryAdded((entry) => {
        useHistoryStore.getState().prependEntry(entry)
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
