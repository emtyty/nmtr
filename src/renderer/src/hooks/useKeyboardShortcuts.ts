import { useEffect } from 'react'
import { useTraceStore } from '../store/useTraceStore'
import { useUIStore } from '../store/useUIStore'

/**
 * Global keyboard shortcuts:
 *   Ctrl+R  — Reset active session stats (preventDefault stops Electron window reload)
 *   Ctrl+E  — Export active session as text → clipboard
 *   Ctrl+,  — Open Settings dialog
 *
 * Ctrl+Enter (Start/Stop) lives in TraceControls because `target` is local state there.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey) return

      const { activeSessionId, sessions } = useTraceStore.getState()
      const session = activeSessionId ? sessions[activeSessionId] : null

      if (e.key === 'r' || e.key === 'R') {
        if (!session || session.isPlayback) return
        e.preventDefault()
        window.nmtrAPI.traceReset({ sessionId: activeSessionId! })
      } else if (e.key === 'e' || e.key === 'E') {
        if (!session || session.isPlayback) return
        e.preventDefault()
        // Main process writes text to clipboard directly; no renderer-side handling needed
        window.nmtrAPI.traceExport({ sessionId: activeSessionId!, format: 'text' }).catch(() => {})
      } else if (e.key === ',') {
        e.preventDefault()
        useUIStore.getState().openSettings()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
