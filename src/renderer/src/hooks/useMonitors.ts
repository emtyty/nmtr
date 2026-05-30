import { useEffect } from 'react'
import { useMonitorStore } from '../store/useMonitorStore'
import { useUIStore } from '../store/useUIStore'
import type { MonitorStateChangeEvent } from '@shared/types'

/**
 * App-level subscription to monitor push events. Mounted once (in App) so
 * monitor state stays live and notifications fire regardless of the active tab.
 */
export function useMonitors(): void {
  const load = useMonitorStore((s) => s.load)
  const applyResult = useMonitorStore((s) => s.applyResult)
  const refreshIncidents = useMonitorStore((s) => s.refreshIncidents)
  const pushRuntimeAlert = useUIStore((s) => s.pushRuntimeAlert)

  useEffect(() => {
    void load()

    function notify(title: string, body: string): void {
      if (!('Notification' in window)) return
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification(title, { body })
        }).catch(() => {})
      }
    }

    const offResult = window.nmtrAPI.onMonitorResult((e) => applyResult(e))

    const offState = window.nmtrAPI.onMonitorStateChange((e: MonitorStateChangeEvent) => {
      const down = e.to === 'down'
      const recovered = e.to === 'up' && e.from !== 'unknown'
      const verb = down ? 'is DOWN' : e.to === 'degraded' ? 'is degraded' : 'recovered'
      const title = `${e.label} ${verb}`
      const body = e.reason ?? `${e.from} → ${e.to}`

      // Surface in the in-app alert stack (errors for down, warn otherwise)…
      pushRuntimeAlert({
        id: `monitor-${e.monitorId}-${e.at}`,
        level: down ? 'error' : 'warn',
        title,
        message: body
      })
      // …and as a desktop notification for down / recovery transitions.
      if (down || recovered || e.to === 'degraded') notify(title, body)

      // A transition may have opened/closed an incident — refresh the timeline.
      void refreshIncidents()
    })

    return () => { offResult(); offState() }
  }, [load, applyResult, refreshIncidents, pushRuntimeAlert])
}
