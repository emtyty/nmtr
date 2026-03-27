import type { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../ipc/channels'

// Don't download automatically — let the user decide
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let win: BrowserWindow | null = null

function send(channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  win = mainWindow

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version)
    send(IPC.UPDATE_AVAILABLE, { version: info.version, releaseNotes: info.releaseNotes ?? null })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] No update available')
  })

  autoUpdater.on('download-progress', (progress) => {
    send(IPC.UPDATE_PROGRESS, { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    console.log('[AutoUpdater] Update downloaded')
    send(IPC.UPDATE_DOWNLOADED)
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message)
    send(IPC.UPDATE_ERROR, { message: err.message })
  })
}

export async function checkForUpdates(): Promise<void> {
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
