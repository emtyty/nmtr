import React from 'react'
import { useRecordingStore } from '../../store/useRecordingStore'

interface PlaybackBarProps {
  sessionId: string
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PlaybackBar({ sessionId }: PlaybackBarProps): React.JSX.Element {
  const {
    playbackPosition,
    playbackDuration,
    playbackSpeed,
    isPlaying,
    playbackFilePath,
    setPlaying,
    setPlaybackSpeed,
    updatePlaybackPosition
  } = useRecordingStore()

  async function handlePlayPause(): Promise<void> {
    if (isPlaying) {
      await window.nmtrAPI.playbackStop({ sessionId })
      setPlaying(false)
    } else {
      await window.nmtrAPI.playbackStart({
        sessionId,
        filePath: playbackFilePath ?? '',
        speed: playbackSpeed
      })
      setPlaying(true)
    }
  }

  async function handleSeek(ms: number): Promise<void> {
    updatePlaybackPosition(ms)
    await window.nmtrAPI.playbackSeek({ sessionId, timestampMs: ms })
  }

  async function handleSpeedChange(speed: number): Promise<void> {
    setPlaybackSpeed(speed)
    if (isPlaying) {
      // Restart at new speed
      await window.nmtrAPI.playbackStop({ sessionId })
      await window.nmtrAPI.playbackStart({
        sessionId,
        filePath: playbackFilePath ?? '',
        speed
      })
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-canvas-subtle border-t border-border-default flex-shrink-0">
      {/* Playback label */}
      <span className="text-xs font-semibold text-fg-muted uppercase tracking-widest flex-shrink-0">
        Playback
      </span>

      {/* Play/Pause button */}
      <button
        className="w-7 h-7 flex items-center justify-center rounded bg-canvas-default border border-border-default text-fg-default hover:border-accent-blue hover:text-accent-blue transition-colors text-sm flex-shrink-0"
        onClick={handlePlayPause}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Position time */}
      <span className="text-sm text-fg-muted font-mono w-10 text-right flex-shrink-0 tabular-nums">
        {formatTime(playbackPosition)}
      </span>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={playbackDuration || 1}
        value={playbackPosition}
        className="flex-1 accent-accent-blue cursor-pointer h-1"
        onChange={(e) => handleSeek(Number(e.target.value))}
      />

      {/* Duration time */}
      <span className="text-sm text-fg-muted font-mono w-10 flex-shrink-0 tabular-nums">
        {formatTime(playbackDuration)}
      </span>

      {/* Speed selector */}
      <select
        className="bg-canvas-default border border-border-default rounded px-2 py-1 text-sm text-fg-default outline-none cursor-pointer flex-shrink-0"
        value={playbackSpeed}
        onChange={(e) => handleSpeedChange(Number(e.target.value))}
      >
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={5}>5×</option>
        <option value={10}>10×</option>
      </select>
    </div>
  )
}
