import React, { useState } from 'react'
import { useTraceStore } from '../../store/useTraceStore'
import { HopTable } from './HopTable'
import { TraceControls } from '../controls/TraceControls'
import { ExportMenu } from '../controls/ExportMenu'
import { WhoisDialog } from '../dialogs/WhoisDialog'
import { LatencyDetailDialog } from '../dialogs/LatencyDetailDialog'
import { StatusBar } from '../layout/StatusBar'

export function TraceView(): React.JSX.Element {
  const { sessions, activeSessionId } = useTraceStore()
  const [whoisIp, setWhoisIp] = useState<string | null>(null)
  const [latencyHopIndex, setLatencyHopIndex] = useState<number | null>(null)

  const session = activeSessionId ? sessions[activeSessionId] : null

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
          <div className="pr-4 flex-shrink-0">
            <ExportMenu sessionId={activeSessionId} />
          </div>
        )}
      </div>

      {/* Hop table or empty state */}
      {session ? (
        <HopTable
          hops={session.hops}
          onWhois={setWhoisIp}
          onLatencyClick={setLatencyHopIndex}
        />
      ) : (
        <EmptyState />
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
