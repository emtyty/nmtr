import { create } from 'zustand'

interface RecordingState {
  // Recording
  isRecording: boolean
  recordingSessionId: string | null

  // Playback
  playbackSessionId: string | null
  playbackFilePath: string | null
  playbackPosition: number  // ms from start
  playbackDuration: number  // ms total
  playbackSpeed: number     // 1 | 2 | 5 | 10
  isPlaying: boolean

  // Actions
  setRecording: (sessionId: string) => void
  clearRecording: () => void
  setPlayback: (sessionId: string, filePath: string, durationMs: number) => void
  updatePlaybackPosition: (positionMs: number) => void
  setPlaybackSpeed: (speed: number) => void
  setPlaying: (playing: boolean) => void
  clearPlayback: () => void
}

export const useRecordingStore = create<RecordingState>((set) => ({
  isRecording: false,
  recordingSessionId: null,
  playbackSessionId: null,
  playbackFilePath: null,
  playbackPosition: 0,
  playbackDuration: 0,
  playbackSpeed: 1,
  isPlaying: false,

  setRecording: (sessionId) => set({ isRecording: true, recordingSessionId: sessionId }),
  clearRecording: () => set({ isRecording: false, recordingSessionId: null }),

  setPlayback: (sessionId, filePath, durationMs) =>
    set({
      playbackSessionId: sessionId,
      playbackFilePath: filePath,
      playbackDuration: durationMs,
      playbackPosition: 0,
      isPlaying: false,
      playbackSpeed: 1
    }),

  updatePlaybackPosition: (positionMs) => set({ playbackPosition: positionMs }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setPlaying: (playing) => set({ isPlaying: playing }),

  clearPlayback: () =>
    set({
      playbackSessionId: null,
      playbackFilePath: null,
      playbackPosition: 0,
      playbackDuration: 0,
      isPlaying: false,
      playbackSpeed: 1
    })
}))
