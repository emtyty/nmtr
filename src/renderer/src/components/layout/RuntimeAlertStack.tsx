import React, { useEffect } from 'react'
import { useUIStore } from '../../store/useUIStore'

const ALERT_TTL_MS = 12_000

export function RuntimeAlertStack(): React.JSX.Element | null {
  const { runtimeAlerts, dismissRuntimeAlert } = useUIStore()

  useEffect(() => {
    if (runtimeAlerts.length === 0) return
    const timers = runtimeAlerts.map((alert) =>
      setTimeout(() => dismissRuntimeAlert(alert.id), ALERT_TTL_MS)
    )
    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [runtimeAlerts, dismissRuntimeAlert])

  if (runtimeAlerts.length === 0) return null

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {runtimeAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`pointer-events-auto rounded-lg border px-3 py-2 shadow-lg ${
            alert.level === 'error'
              ? 'border-accent-red/60 bg-[#2a1315] text-red-200'
              : 'border-accent-yellow/60 bg-[#2b2413] text-amber-100'
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="text-sm font-semibold">{alert.title}</div>
              <div className="text-xs opacity-90">{alert.message}</div>
            </div>
            <button
              onClick={() => dismissRuntimeAlert(alert.id)}
              className="text-sm opacity-70 hover:opacity-100"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
