import { create } from 'zustand'
import type { TracertResultEvent } from '@shared/types'

interface UIState {
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void

  tracertModalOpen: boolean
  tracertResult: TracertResultEvent | null
  showTracertResult: (result: TracertResultEvent) => void  // stores result, no auto-open
  openTracertModal: () => void
  closeTracertModal: () => void

  // Auto-update
  updateInfo: { version: string; releaseNotes: string | null } | null
  updateProgress: number | null // 0–100, null = not downloading
  updateDownloaded: boolean
  updateError: string | null
  setUpdateInfo: (info: { version: string; releaseNotes: string | null }) => void
  setUpdateProgress: (percent: number | null) => void
  setUpdateDownloaded: () => void
  setUpdateError: (message: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  tracertModalOpen: false,
  tracertResult: null,
  showTracertResult: (result) => set({ tracertResult: result }),  // store only, no auto-open
  openTracertModal: () => set({ tracertModalOpen: true }),
  closeTracertModal: () => set({ tracertModalOpen: false }),

  updateInfo: null,
  updateProgress: null,
  updateDownloaded: false,
  updateError: null,
  setUpdateInfo: (info) => set({ updateInfo: info, updateError: null }),
  setUpdateProgress: (percent) => set({ updateProgress: percent }),
  setUpdateDownloaded: () => set({ updateDownloaded: true, updateProgress: null }),
  setUpdateError: (message) => set({ updateError: message, updateProgress: null })
}))
