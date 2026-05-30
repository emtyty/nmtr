import React, { useEffect } from 'react'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { IconNav } from './components/layout/IconNav'
import { TraceView } from './components/trace/TraceView'
import { TracertResultModal } from './components/trace/TracertResultModal'
import { WhoisDialog } from './components/dialogs/WhoisDialog'
import { HistoryView } from './components/views/HistoryView'
import { LanNetworkView } from './components/lan/LanNetworkView'
import { SpeedTestView } from './components/views/SpeedTestView'
import { PortScanView } from './components/views/PortScanView'
import { DnsView } from './components/views/DnsView'
import { SslView } from './components/views/SslView'
import { PublicScanView } from './components/views/PublicScanView'
import { useTraceSession } from './hooks/useTraceSession'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSettingsStore } from './store/useSettingsStore'
import { useUIStore } from './store/useUIStore'
import { UpdateBanner } from './components/update/UpdateBanner'
import { useUpdater } from './hooks/useUpdater'
import { RuntimeAlertStack } from './components/layout/RuntimeAlertStack'

export default function App(): React.JSX.Element {
  const { load } = useSettingsStore()
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const whoisIp = useUIStore((s) => s.whoisIp)
  const closeWhois = useUIStore((s) => s.closeWhois)

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
        ) : activeView === 'portscan' ? (
          <PortScanView />
        ) : activeView === 'speedtest' ? (
          <SpeedTestView />
        ) : activeView === 'dns' ? (
          <DnsView />
        ) : activeView === 'ssl' ? (
          <SslView />
        ) : activeView === 'pubscan' ? (
          <PublicScanView />
        ) : (
          <HistoryView />
        )}
      </div>
      <TracertResultModal />
      <WhoisDialog ip={whoisIp} onClose={closeWhois} />
    </div>
  )
}
