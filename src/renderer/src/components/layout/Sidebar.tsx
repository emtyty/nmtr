import React, { useState } from 'react'
import { useTraceStore } from '../../store/useTraceStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useRecordingStore } from '../../store/useRecordingStore'
import type { TraceConfig } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

function StatusDot({ status }: { status: string }): React.JSX.Element {
  if (status === 'running') {
    return (
      <span className="w-2 h-2 rounded-full bg-accent-green pulse-dot flex-shrink-0" />
    )
  }
  if (status === 'paused') {
    return <span className="w-2 h-2 rounded-full bg-accent-yellow flex-shrink-0" />
  }
  return <span className="w-2 h-2 rounded-full bg-fg-subtle flex-shrink-0" />
}

export function Sidebar(): React.JSX.Element {
  const { sessions, activeSessionId, setActive, removeSession, addSession, addPlaybackSession } = useTraceStore()
  const { settings } = useSettingsStore()
  const [newTarget, setNewTarget] = useState('')
  const [showInput, setShowInput] = useState(false)

  const sessionList = Object.values(sessions)

  async function startNewTrace(target: string): Promise<void> {
    if (!target.trim()) return
    const config: TraceConfig = {
      target: target.trim(),
      protocol: settings.defaultProtocol ?? DEFAULT_SETTINGS.defaultProtocol,
      intervalMs: settings.defaultIntervalMs ?? DEFAULT_SETTINGS.defaultIntervalMs,
      packetSize: settings.defaultPacketSize ?? DEFAULT_SETTINGS.defaultPacketSize,
      maxHops: settings.maxHops ?? DEFAULT_SETTINGS.maxHops,
      useIPv6: false,
      resolveHostnames: settings.resolveHostnames ?? DEFAULT_SETTINGS.resolveHostnames
    }
    try {
      const result = await window.nmtrAPI.traceStart({ config })
      addSession(result.sessionId, config, result.engineMode as 'pingus' | 'native')
      setNewTarget('')
      setShowInput(false)
    } catch (err) {
      console.error('Failed to start trace:', err)
    }
  }

  async function handleOpenRecording(): Promise<void> {
    try {
      const result = await window.nmtrAPI.playbackOpen()
      if (!result) return
      const config: TraceConfig = {
        target: result.meta.target,
        protocol: result.meta.protocol,
        intervalMs: result.meta.intervalMs,
        packetSize: DEFAULT_SETTINGS.defaultPacketSize,
        maxHops: DEFAULT_SETTINGS.maxHops,
        useIPv6: false,
        resolveHostnames: false
      }
      addPlaybackSession(result.sessionId, config)
      setActive(result.sessionId)
      useRecordingStore.getState().setPlayback(result.sessionId, result.filePath, result.durationMs)
    } catch (err) {
      console.error('Failed to open recording:', err)
    }
  }

  return (
    <div className="w-48 bg-canvas-subtle border-r border-border-default flex flex-col flex-shrink-0 overflow-hidden">
      <div className="px-3 py-2 text-sm font-semibold text-fg-muted uppercase tracking-widest">
        Active Traces
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessionList.map((session) => (
          <div
            key={session.id}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors group ${
              session.id === activeSessionId
                ? 'bg-slate-800 border-accent-blue'
                : 'border-transparent hover:bg-slate-800/50'
            }`}
            onClick={() => setActive(session.id)}
          >
            <StatusDot status={session.status} />
            <div className="flex-1 min-w-0">
              <div className="text-base font-medium text-fg-default truncate">
                {session.isPlayback ? '▶ ' : ''}{session.config.target}
              </div>
              <div className="text-sm text-fg-muted truncate">
                {session.hops.length} hop{session.hops.length !== 1 ? 's' : ''} · {session.status}
              </div>
            </div>
            <button
              className="text-fg-subtle opacity-0 group-hover:opacity-100 text-base leading-none hover:text-fg-default transition"
              onClick={(e) => {
                e.stopPropagation()
                window.nmtrAPI.traceStop({ sessionId: session.id })
                removeSession(session.id)
              }}
              title="Close trace"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* New trace input + Open recording */}
      <div className="p-3 border-t border-border-default space-y-2">
        {showInput ? (
          <input
            autoFocus
            className="w-full bg-canvas-default border border-border-default rounded px-2 py-1 text-base text-fg-default outline-none focus:border-accent-blue"
            placeholder="hostname or IP..."
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') startNewTrace(newTarget)
              if (e.key === 'Escape') { setShowInput(false); setNewTarget('') }
            }}
            onBlur={() => { if (!newTarget) setShowInput(false) }}
          />
        ) : (
          <button
            className="w-full border border-dashed border-border-default rounded px-2 py-1 text-sm text-fg-muted hover:border-accent-blue hover:text-accent-blue transition-colors"
            onClick={() => setShowInput(true)}
          >
            + New Trace
          </button>
        )}
        <button
          className="w-full border border-dashed border-border-default rounded px-2 py-1 text-sm text-fg-muted hover:border-fg-muted hover:text-fg-default transition-colors"
          onClick={handleOpenRecording}
        >
          📂 Open .nmtr
        </button>
      </div>
    </div>
  )
}
