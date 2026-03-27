import { useEffect } from 'react'
import { useUIStore } from '../store/useUIStore'

export function useUpdater(): void {
  useEffect(() => {
    const { setUpdateInfo, setUpdateProgress, setUpdateDownloaded, setUpdateError } =
      useUIStore.getState()

    const unsubs = [
      window.nmtrAPI.onUpdateAvailable((e) => setUpdateInfo(e)),
      window.nmtrAPI.onUpdateProgress((e) => setUpdateProgress(e.percent)),
      window.nmtrAPI.onUpdateDownloaded(() => setUpdateDownloaded()),
      window.nmtrAPI.onUpdateError((e) => setUpdateError(e.message))
    ]

    return () => unsubs.forEach((u) => u())
  }, [])
}
