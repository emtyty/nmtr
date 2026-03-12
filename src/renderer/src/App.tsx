import React, { useEffect } from 'react'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { TraceView } from './components/trace/TraceView'
import { useTraceSession } from './hooks/useTraceSession'
import { useSettingsStore } from './store/useSettingsStore'

export default function App(): React.JSX.Element {
  // Load settings on mount
  const { load } = useSettingsStore()
  useEffect(() => { load() }, [])

  // Subscribe to all IPC push events → Zustand store
  useTraceSession()

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-canvas-default text-fg-default">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <TraceView />
      </div>
    </div>
  )
}
