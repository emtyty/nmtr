import React, { useState, useEffect, useCallback } from 'react'
import { useTraceStore } from '../../store/useTraceStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useRecordingStore } from '../../store/useRecordingStore'
import type { TraceConfig, Protocol } from '@shared/types'

interface TraceControlsProps {
  sessionId: string | null
}

export function TraceControls({ sessionId }: TraceControlsProps): React.JSX.Element {
  const { sessions, addSession, setActive } = useTraceStore()
  const { settings } = useSettingsStore()
  const { isRecording, recordingSessionId, setRecording, clearRecording } = useRecordingStore()

  const [target, setTarget] = useState('')
  const [protocol, setProtocol] = useState<Protocol>('icmp')
  const [port, setPort] = useState(80)
  const [intervalMs, setIntervalMs] = useState(500)
  const [useIPv6, setUseIPv6] = useState(false)
  const [loading, setLoading] = useState(false)

  const session = sessionId ? sessions[sessionId] : null
  const isRunning = session?.status === 'running'
  const isThisSessionRecording = isRecording && recordingSessionId === sessionId

  async function handleStart(): Promise<void> {
    if (!target.trim()) return
    setLoading(true)
    try {
      const config: TraceConfig = {
        target: target.trim(),
        protocol,
        port: protocol !== 'icmp' ? port : undefined,
        intervalMs,
        packetSize: settings.defaultPacketSize ?? 64,
        maxHops: settings.maxHops ?? 30,
        useIPv6,
        resolveHostnames: settings.resolveHostnames ?? true
      }
      const result = await window.nmtrAPI.traceStart({ config })
      addSession(result.sessionId, config, result.engineMode as 'pingus' | 'native')
      setActive(result.sessionId)
    } catch (err) {
      console.error('Start trace failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleStop(): void {
    if (!sessionId) return
    window.nmtrAPI.traceStop({ sessionId })
  }

  function handleReset(): void {
    if (!sessionId) return
    window.nmtrAPI.traceReset({ sessionId })
  }

  // Wrap in useCallback so the useEffect dependency array stays stable
  const stableHandleStart = useCallback(handleStart, [target, protocol, port, intervalMs, useIPv6, settings])
  const stableHandleStop = useCallback(handleStop, [sessionId])

  // Ctrl+Enter: start or stop — lives here because `target` is local state
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey || e.key !== 'Enter') return
      e.preventDefault()
      if (isRunning) {
        stableHandleStop()
      } else if (!loading) {
        stableHandleStart()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isRunning, loading, stableHandleStart, stableHandleStop])

  async function handleRecordToggle(): Promise<void> {
    if (!sessionId) return
    if (isThisSessionRecording) {
      await window.nmtrAPI.recordingStop({ sessionId })
      clearRecording()
    } else {
      // filePath empty → main process shows save dialog
      await window.nmtrAPI.recordingStart({ sessionId, filePath: '' })
      setRecording(sessionId)
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-canvas-subtle border-b border-border-default flex-shrink-0 flex-wrap">
      {/* Target input */}
      <input
        className="bg-canvas-default border border-border-default rounded px-3 py-1.5 text-lg text-fg-default outline-none focus:border-accent-blue w-64"
        placeholder="hostname or IP address…"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !isRunning && !loading && handleStart()}
        disabled={isRunning || loading}
      />

      {/* Protocol picker */}
      <select
        className="bg-canvas-default border border-border-default rounded px-2 py-1.5 text-base text-fg-default outline-none cursor-pointer"
        value={protocol}
        onChange={(e) => setProtocol(e.target.value as Protocol)}
        disabled={isRunning || loading}
      >
        <option value="icmp">ICMP</option>
        <option value="udp">UDP</option>
        <option value="tcp">TCP</option>
      </select>

      {/* Port (UDP/TCP only) */}
      {protocol !== 'icmp' && (
        <input
          type="number"
          className="bg-canvas-default border border-border-default rounded px-2 py-1.5 text-base text-fg-default outline-none w-20"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          placeholder="Port"
          disabled={isRunning || loading}
          min={1}
          max={65535}
        />
      )}

      <div className="w-px h-5 bg-border-default" />

      {/* Interval */}
      <div className="flex items-center gap-1.5">
        <span className="text-base text-fg-muted">Interval</span>
        <select
          className="bg-canvas-default border border-border-default rounded px-2 py-1.5 text-base text-fg-default outline-none cursor-pointer"
          value={intervalMs}
          onChange={(e) => setIntervalMs(Number(e.target.value))}
          disabled={isRunning || loading}
        >
          <option value={500}>500ms</option>
          <option value={1000}>1s</option>
          <option value={2000}>2s</option>
          <option value={5000}>5s</option>
        </select>
      </div>

      {/* IPv4 / IPv6 */}
      <button
        className={`text-base px-2 py-1.5 rounded border transition-colors ${
          useIPv6
            ? 'border-accent-blue text-accent-blue'
            : 'border-border-default text-fg-muted hover:border-accent-blue hover:text-accent-blue'
        }`}
        onClick={() => setUseIPv6((v) => !v)}
        disabled={isRunning || loading}
      >
        {useIPv6 ? 'IPv6' : 'IPv4'}
      </button>

      <div className="w-px h-5 bg-border-default" />

      {/* Start / Stop / Preparing */}
      {loading ? (
        <div className="flex items-center gap-2 px-4 py-1.5 rounded bg-[#238636]/40 text-white text-base font-semibold select-none">
          <svg className="animate-spin w-3.5 h-3.5 text-white flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Preparing…
        </div>
      ) : !isRunning ? (
        <button
          className="bg-[#238636] hover:bg-[#2ea043] text-white text-base font-semibold px-4 py-1.5 rounded transition-colors disabled:opacity-50"
          onClick={handleStart}
          disabled={!target.trim()}
          title="Start trace (Ctrl+Enter)"
        >
          ▶ Start
        </button>
      ) : (
        <button
          className="bg-[#da3633] hover:bg-[#f85149] text-white text-base font-semibold px-4 py-1.5 rounded transition-colors"
          onClick={handleStop}
          title="Stop trace (Ctrl+Enter)"
        >
          ■ Stop
        </button>
      )}

      {sessionId && !loading && (
        <button
          className="text-base px-3 py-1.5 rounded border border-border-default text-fg-muted hover:border-fg-muted hover:text-fg-default transition-colors"
          onClick={handleReset}
          title="Reset stats (Ctrl+R)"
        >
          Reset
        </button>
      )}

      {/* Record button — only while a live (non-playback) session is running */}
      {isRunning && !session?.isPlayback && !loading && (
        <button
          className={`text-base px-3 py-1.5 rounded border transition-colors ${
            isThisSessionRecording
              ? 'border-red-500 text-red-400 hover:bg-red-500/10'
              : 'border-border-default text-fg-muted hover:border-red-500 hover:text-red-400'
          }`}
          onClick={handleRecordToggle}
          title={isThisSessionRecording ? 'Stop Recording' : 'Record session to .nmtr file'}
        >
          {isThisSessionRecording ? '⏹ Stop Rec' : '⏺ Rec'}
        </button>
      )}

      {/* Status indicator */}
      {loading && (
        <span className="ml-auto text-base text-fg-muted italic">
          Discovering hops via tracert…
        </span>
      )}
      {isRunning && !loading && (
        <div className="flex items-center gap-1.5 ml-auto text-base text-accent-green">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green pulse-dot" />
          Running · {session?.totalSent ?? 0} probes
        </div>
      )}
    </div>
  )
}
