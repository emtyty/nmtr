import React, { useState, useEffect, useCallback } from 'react'
import { useTraceStore } from '../../store/useTraceStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useRecordingStore } from '../../store/useRecordingStore'
import { useUIStore } from '../../store/useUIStore'
import type { TraceConfig } from '@shared/types'

interface TraceControlsProps {
  sessionId: string | null
}

export function TraceControls({ sessionId }: TraceControlsProps): React.JSX.Element {
  const { sessions, addSession, setActive } = useTraceStore()
  const { settings } = useSettingsStore()
  const { isRecording, recordingSessionId, setRecording, clearRecording } = useRecordingStore()

  const [target, setTarget] = useState('')
  const [intervalMs, setIntervalMs] = useState(500)
  const [useIPv6, setUseIPv6] = useState(false)
  const [loading, setLoading] = useState(false)

  const session = sessionId ? sessions[sessionId] : null
  const isRunning = session?.status === 'running'
  const isPaused = session?.status === 'paused'
  const isThisSessionRecording = isRecording && recordingSessionId === sessionId

  const tracePrefill = useUIStore((s) => s.tracePrefill)
  const clearTracePrefill = useUIStore((s) => s.clearTracePrefill)

  useEffect(() => {
    if (!isRunning && !isPaused) {
      setUseIPv6(settings.defaultUseIPv6)
    }
  }, [settings.defaultUseIPv6, isRunning, isPaused])

  // Consume a target handed off from another view (e.g. a port-scan row action).
  useEffect(() => {
    if (tracePrefill && !isRunning && !isPaused) {
      setTarget(tracePrefill)
      clearTracePrefill()
    }
  }, [tracePrefill, isRunning, isPaused, clearTracePrefill])

  async function handleStart(): Promise<void> {
    if (!target.trim()) return
    setLoading(true)
    try {
      const config: TraceConfig = {
        target: target.trim(),
        protocol: 'icmp',
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

  function handlePause(): void {
    if (!sessionId) return
    window.nmtrAPI.tracePause({ sessionId })
  }

  function handleResume(): void {
    if (!sessionId) return
    window.nmtrAPI.traceResume({ sessionId })
  }

  function handleReset(): void {
    if (!sessionId) return
    window.nmtrAPI.traceReset({ sessionId })
  }

  // Wrap in useCallback so the useEffect dependency array stays stable
  const stableHandleStart = useCallback(handleStart, [target, intervalMs, settings])
  const stableHandleStop = useCallback(handleStop, [sessionId])
  const stableHandleResume = useCallback(handleResume, [sessionId])

  // Ctrl+Enter: start or stop — lives here because `target` is local state
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey || e.key !== 'Enter') return
      e.preventDefault()
      if (isRunning) {
        stableHandleStop()
      } else if (isPaused) {
        stableHandleResume()
      } else if (!loading) {
        stableHandleStart()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isRunning, isPaused, loading, stableHandleStart, stableHandleStop, stableHandleResume])

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
        onKeyDown={(e) => e.key === 'Enter' && !isRunning && !isPaused && !loading && handleStart()}
        disabled={isRunning || isPaused || loading}
      />

      {/* Protocol indicator (only ICMP supported currently) */}
      <span className="bg-canvas-default border border-border-default rounded px-2 py-1.5 text-base text-fg-muted select-none">
        {useIPv6 ? 'ICMPv6' : 'ICMP'}
      </span>

      <label className="flex items-center gap-1.5 text-base text-fg-muted cursor-pointer">
        <input
          type="checkbox"
          checked={useIPv6}
          onChange={(e) => setUseIPv6(e.target.checked)}
          disabled={isRunning || isPaused || loading}
          className="w-4 h-4 accent-accent-blue"
        />
        IPv6
      </label>

      <div className="w-px h-5 bg-border-default" />

      {/* Interval */}
      <div className="flex items-center gap-1.5">
        <span className="text-base text-fg-muted">Interval</span>
        <select
          className="bg-canvas-default border border-border-default rounded px-2 py-1.5 text-base text-fg-default outline-none cursor-pointer"
          value={intervalMs}
          onChange={(e) => setIntervalMs(Number(e.target.value))}
          disabled={isRunning || isPaused || loading}
        >
          <option value={500}>500ms</option>
          <option value={1000}>1s</option>
          <option value={2000}>2s</option>
          <option value={5000}>5s</option>
        </select>
      </div>

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
      ) : isRunning ? (
        <>
          <button
            className="bg-[#d29922] hover:bg-[#e3b341] text-white text-base font-semibold px-4 py-1.5 rounded transition-colors"
            onClick={handlePause}
            title="Pause trace"
          >
            Ⅱ Pause
          </button>
          <button
            className="bg-[#da3633] hover:bg-[#f85149] text-white text-base font-semibold px-4 py-1.5 rounded transition-colors"
            onClick={handleStop}
            title="Stop trace (Ctrl+Enter)"
          >
            ■ Stop
          </button>
        </>
      ) : isPaused ? (
        <>
          <button
            className="bg-accent-blue hover:opacity-90 text-white text-base font-semibold px-4 py-1.5 rounded transition-colors"
            onClick={handleResume}
            title="Resume trace (Ctrl+Enter)"
          >
            ▶ Resume
          </button>
          <button
            className="bg-[#da3633] hover:bg-[#f85149] text-white text-base font-semibold px-4 py-1.5 rounded transition-colors"
            onClick={handleStop}
            title="Stop trace"
          >
            ■ Stop
          </button>
        </>
      ) : (
        <button
          className="bg-[#238636] hover:bg-[#2ea043] text-white text-base font-semibold px-4 py-1.5 rounded transition-colors disabled:opacity-50"
          onClick={handleStart}
          disabled={!target.trim()}
          title="Start trace (Ctrl+Enter)"
        >
          ▶ Start
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
      {isPaused && !loading && (
        <div className="flex items-center gap-1.5 ml-auto text-base text-accent-yellow">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow" />
          Paused · {session?.totalSent ?? 0} probes
        </div>
      )}
    </div>
  )
}
