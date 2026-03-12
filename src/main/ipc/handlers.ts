import { ipcMain, dialog, clipboard } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from './channels'
import { ProberManager } from '../prober/ProberManager'
import { fetchWhois } from '../enrichment/WhoisFetcher'
import { AppSettingsStore } from '../store/AppSettings'
import { formatExport } from '../export/ExportFormatter'
import { SessionPlayer } from '../recording/SessionPlayer'
import type {
  TraceStartPayload,
  TraceStopPayload,
  TraceResetPayload,
  ExportPayload,
  WhoisPayload,
  RecordingStartPayload,
  RecordingStopPayload,
  PlaybackStartPayload,
  PlaybackSeekPayload,
  PlaybackStopPayload
} from '../../shared/types'

const players = new Map<string, SessionPlayer>()

export function registerHandlers(win: BrowserWindow): void {
  ProberManager.setWindow(win)

  // ── Trace ──────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.TRACE_START, async (_e, payload: TraceStartPayload) => {
    return ProberManager.createSession(payload.config)
  })

  ipcMain.handle(IPC.TRACE_STOP, async (_e, payload: TraceStopPayload) => {
    ProberManager.stopSession(payload.sessionId)
  })

  ipcMain.handle(IPC.TRACE_RESET, async (_e, payload: TraceResetPayload) => {
    ProberManager.resetSession(payload.sessionId)
  })

  ipcMain.handle(IPC.TRACE_EXPORT, async (_e, payload: ExportPayload) => {
    const session = ProberManager.getSession(payload.sessionId)
    if (!session) throw new Error('Session not found')
    const hops = session.getAllSnapshots()
    const result = formatExport(hops, session.config, payload.format)

    if (payload.format === 'text') {
      clipboard.writeText(result.content)
      return result
    }

    const { filePath } = await dialog.showSaveDialog(win!, {
      defaultPath: result.suggestedFilename,
      filters: [{ name: result.mimeType, extensions: [result.suggestedFilename.split('.').pop()!] }]
    })

    if (filePath) {
      const { writeFileSync } = await import('fs')
      writeFileSync(filePath, result.content, 'utf8')
    }

    return result
  })

  // ── WHOIS ──────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.WHOIS_FETCH, async (_e, payload: WhoisPayload) => {
    const raw = await fetchWhois(payload.ip)
    return { raw }
  })

  // ── Settings ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return AppSettingsStore.get()
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_e, partial) => {
    AppSettingsStore.set(partial)
  })

  // ── Recording ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.RECORDING_START, async (_e, payload: RecordingStartPayload) => {
    let filePath = payload.filePath
    if (!filePath) {
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: `nmtr-${Date.now()}.nmtr`,
        filters: [{ name: 'nmtr Recording', extensions: ['nmtr'] }]
      })
      if (!result.filePath) return
      filePath = result.filePath
    }
    ProberManager.startRecording(payload.sessionId, filePath)
  })

  ipcMain.handle(IPC.RECORDING_STOP, async (_e, payload: RecordingStopPayload) => {
    const filePath = ProberManager.stopRecording(payload.sessionId)
    return { filePath }
  })

  // ── Playback ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.PLAYBACK_OPEN, async () => {
    const result = await dialog.showOpenDialog(win!, {
      filters: [{ name: 'nmtr Recording', extensions: ['nmtr'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const filePath = result.filePaths[0]
    // Create a temporary player to read meta+duration
    const { randomUUID } = await import('crypto')
    const tempId = randomUUID()
    const player = new SessionPlayer(tempId, win!)
    const info = await player.load(filePath)
    players.set(tempId, player)

    return {
      filePath,
      meta: info.meta,
      durationMs: info.durationMs,
      frameCount: info.frameCount,
      sessionId: tempId
    }
  })

  ipcMain.handle(IPC.PLAYBACK_START, async (_e, payload: PlaybackStartPayload) => {
    let player = players.get(payload.sessionId)
    if (!player) {
      player = new SessionPlayer(payload.sessionId, win!)
      await player.load(payload.filePath)
      players.set(payload.sessionId, player)
    }
    player.play(payload.speed ?? 1)
  })

  ipcMain.handle(IPC.PLAYBACK_SEEK, async (_e, payload: PlaybackSeekPayload) => {
    players.get(payload.sessionId)?.seek(payload.timestampMs)
  })

  ipcMain.handle(IPC.PLAYBACK_STOP, async (_e, payload: PlaybackStopPayload) => {
    players.get(payload.sessionId)?.stop()
    players.delete(payload.sessionId)
  })
}
