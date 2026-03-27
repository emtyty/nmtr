import React, { useState, useMemo } from 'react'
import { useTraceStore } from '../../store/useTraceStore'
import { useUIStore } from '../../store/useUIStore'
import { HopTable } from './HopTable'
import { RouteEventsPanel } from './RouteEventsPanel'
import { TraceControls } from '../controls/TraceControls'
import { ExportMenu } from '../controls/ExportMenu'
import { WhoisDialog } from '../dialogs/WhoisDialog'
import { LatencyDetailDialog } from '../dialogs/LatencyDetailDialog'
import { StatusBar } from '../layout/StatusBar'
import { PlaybackBar } from '../playback/PlaybackBar'
import { SessionRttChart } from './SessionRttChart'
import { NetworkPathMap } from '../network-map/NetworkPathMap'
import { NetworkGeoMap } from '../network-map/NetworkGeoMap'

type MapTab = 'table' | 'path' | 'map'

export function TraceView(): React.JSX.Element {
  const { sessions, activeSessionId } = useTraceStore()
  const { tracertResult, openTracertModal } = useUIStore()
  const [whoisIp, setWhoisIp] = useState<string | null>(null)
  const [latencyHopIndex, setLatencyHopIndex] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<MapTab>('table')

  const session = activeSessionId ? sessions[activeSessionId] : null

  // Derive set of hop indexes that have ever had a route change — memoized to
  // avoid defeating React.memo on HopRow for hops that haven't changed
  const affectedHops = useMemo(
    () => new Set((session?.routeEvents ?? []).map((e) => e.hopIndex)),
    [session?.routeEvents]
  )

  // Find the hop with the largest latency increase vs its nearest predecessor.
  // Skips * * * hops (avg === null). Only marks when delta > 10ms to avoid noise.
  const bottleneckInfo = useMemo((): { hopIndex: number; delta: number } | null => {
    const hops = session?.hops ?? []
    const sorted = [...hops].sort((a, b) => a.hopIndex - b.hopIndex)
    let maxDelta = 10 // minimum ms threshold to be considered a bottleneck
    let result: { hopIndex: number; delta: number } | null = null
    let prevAvg: number | null = null
    for (const hop of sorted) {
      if (hop.avg === null) continue
      if (prevAvg !== null) {
        const delta = hop.avg - prevAvg
        if (delta > maxDelta) {
          maxDelta = delta
          result = { hopIndex: hop.hopIndex, delta }
        }
      }
      prevAvg = hop.avg
    }
    return result
  }, [session?.hops])

  // Derive latest hop data from the store — auto-updates as probes arrive
  const latencyHop =
    latencyHopIndex !== null
      ? (session?.hops.find((h) => h.hopIndex === latencyHopIndex) ?? null)
      : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Top controls bar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex-1">
          <TraceControls sessionId={activeSessionId} />
        </div>
        {activeSessionId && session && (
          <div className="pr-4 flex-shrink-0 flex items-center gap-2">
            {/* Show tracert button only when we have a result for this session */}
            {tracertResult && tracertResult.sessionId === activeSessionId && (
              <button
                onClick={() => openTracertModal()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border-default text-fg-muted hover:text-fg-default hover:bg-canvas-subtle transition-colors"
                title="View tracert discovery output"
              >
                <span>📡</span>
                <span>Tracert</span>
                {tracertResult.error && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                )}
              </button>
            )}
            <ExportMenu sessionId={activeSessionId} />
          </div>
        )}
      </div>

      {/* RTT heartbeat chart — shown when session has data */}
      {session && session.rttHistory.length > 0 && (
        <SessionRttChart
          rttHistory={session.rttHistory}
          target={session.config.target}
        />
      )}

      {/* Tab bar — shown only when a session is active */}
      {session && (
        <div className="flex items-center gap-0 border-b border-border-default flex-shrink-0 px-4">
          {(['table', 'path', 'map'] as MapTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-accent-blue text-fg-default'
                  : 'border-transparent text-fg-muted hover:text-fg-default'
              }`}
            >
              {tab === 'table' ? 'Table' : tab === 'path' ? 'Path' : 'Map'}
            </button>
          ))}
        </div>
      )}

      {/* Main content area */}
      {session ? (
        <>
          {activeTab === 'table' && (
            <HopTable
              hops={session.hops}
              onWhois={setWhoisIp}
              onLatencyClick={setLatencyHopIndex}
              affectedHops={affectedHops}
              bottleneckInfo={bottleneckInfo}
            />
          )}
          {activeTab === 'path' && (
            <NetworkPathMap hops={session.hops} onWhois={setWhoisIp} />
          )}
          {activeTab === 'map' && (
            <NetworkGeoMap hops={session.hops} />
          )}
        </>
      ) : (
        <EmptyState />
      )}

      {/* Route events panel — shown only in table tab */}
      {session && activeTab === 'table' && (
        <RouteEventsPanel
          events={session.routeEvents}
          sessionStartedAt={session.startedAt}
        />
      )}

      {/* Playback bar — shown only for playback sessions */}
      {session?.isPlayback && activeSessionId && (
        <PlaybackBar sessionId={activeSessionId} />
      )}

      {/* Status bar */}
      <StatusBar session={session ?? null} />

      {/* WHOIS dialog */}
      <WhoisDialog ip={whoisIp} onClose={() => setWhoisIp(null)} />

      {/* Latency detail dialog — receives live hop data from store */}
      <LatencyDetailDialog hop={latencyHop} onClose={() => setLatencyHopIndex(null)} />
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-fg-muted">
      <div className="text-7xl opacity-30">◈</div>
      <div>
        <p className="text-lg font-medium text-fg-subtle mb-1">No active trace</p>
        <p className="text-base">
          Enter a hostname or IP above and press Start, or click + New Trace in the sidebar.
        </p>
      </div>
    </div>
  )
}
