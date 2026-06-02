import { useEffect } from 'react'
import { useUIStore } from '../store/useUIStore'

export function useUpdater(): void {
  useEffect(() => {
    const {
      setUpdateChecking,
      setUpdateInfo,
      setUpdateNotAvailable,
      setUpdateProgress,
      setUpdateDownloaded,
      setUpdateError,
    } = useUIStore.getState()

    const unsubs = [
      window.nmtrAPI.onUpdateChecking((e) => setUpdateChecking(e.manual)),
      window.nmtrAPI.onUpdateAvailable((e) => setUpdateInfo({ version: e.version })),
      window.nmtrAPI.onUpdateNotAvailable((e) => setUpdateNotAvailable(e.manual)),
      window.nmtrAPI.onUpdateDownloading((e) => setUpdateProgress(e.percent)),
      window.nmtrAPI.onUpdateDownloaded((e) => setUpdateDownloaded(e.version)),
      window.nmtrAPI.onUpdateError((e) => setUpdateError(e.message)),
    ]

    return () => unsubs.forEach((u) => u())
  }, [])
}
