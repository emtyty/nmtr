import React, { useState } from 'react'
import { useUIStore } from '../../store/useUIStore'

export function UpdateBanner(): React.JSX.Element | null {
  const { updateChecking, updateInfo, updateProgress, updateDownloaded, updateNotAvailable, updateError } = useUIStore()
  const [dismissed, setDismissed] = useState(false)

  const visible = updateChecking || updateError || updateDownloaded || updateProgress !== null || updateInfo || updateNotAvailable
  if (dismissed || !visible) return null

  async function handleInstall(): Promise<void> {
    await window.nmtrAPI.installUpdate()
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-accent-blue/10 border-b border-accent-blue/30 text-sm flex-shrink-0">
      {updateError ? (
        <span className="text-red-400 flex-1">Update error: {updateError}</span>
      ) : updateDownloaded ? (
        <>
          <span className="text-fg-default flex-1">
            Update <span className="font-semibold">{updateInfo?.version}</span> ready to install.
          </span>
          <button
            onClick={handleInstall}
            className="px-3 py-0.5 rounded bg-accent-blue text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Restart &amp; Install
          </button>
        </>
      ) : updateProgress !== null ? (
        <>
          <span className="text-fg-muted flex-1">Downloading update… {Math.round(updateProgress)}%</span>
          <div className="w-32 h-1.5 rounded-full bg-canvas-subtle overflow-hidden">
            <div
              className="h-full bg-accent-blue rounded-full transition-all"
              style={{ width: `${updateProgress}%` }}
            />
          </div>
        </>
      ) : updateNotAvailable ? (
        <span className="text-fg-muted flex-1">Already up to date.</span>
      ) : updateInfo ? (
        <span className="text-fg-default flex-1">
          Update <span className="font-semibold">{updateInfo.version}</span> found, downloading…
        </span>
      ) : updateChecking ? (
        <span className="text-fg-muted flex-1">Checking for updates…</span>
      ) : null}
      {!updateChecking && (
        <button
          onClick={() => setDismissed(true)}
          className="text-fg-subtle hover:text-fg-default transition-colors text-base leading-none ml-1"
          title="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}
