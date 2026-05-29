import React, { useEffect, useState } from 'react'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { IconNav } from './components/layout/IconNav'
import type { NavView } from './components/layout/IconNav'
import { TraceView } from './components/trace/TraceView'
import { TracertResultModal } from './components/trace/TracertResultModal'
import { HistoryView } from './components/views/HistoryView'
import { LanNetworkView } from './components/lan/LanNetworkView'
import { SpeedTestView } from './components/views/SpeedTestView'
import { useTraceSession } from './hooks/useTraceSession'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSettingsStore } from './store/useSettingsStore'
import { UpdateBanner } from './components/update/UpdateBanner'
import { useUpdater } from './hooks/useUpdater'
import { RuntimeAlertStack } from './components/layout/RuntimeAlertStack'

export default function App(): React.JSX.Element {
  const { load } = useSettingsStore()
  const [activeView, setActiveView] = useState<NavView>('traces')

  useEffect(() => { load() }, [])

  // Subscribe to all IPC push events → Zustand store
  useTraceSession()
  useKeyboardShortcuts()
  useUpdater()

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-canvas-default text-fg-default">
      <TitleBar />
      <UpdateBanner />
      <RuntimeAlertStack />
      <div className="flex flex-1 overflow-hidden">
        <IconNav activeView={activeView} onNavigate={setActiveView} />
        {activeView === 'traces' ? (
          <>
            <Sidebar />
            <TraceView />
          </>
        ) : activeView === 'lan' ? (
          <LanNetworkView />
        ) : activeView === 'speedtest' ? (
          <SpeedTestView />
        ) : (
          <HistoryView />
        )}
      </div>
      <TracertResultModal />
    </div>
  )
}
