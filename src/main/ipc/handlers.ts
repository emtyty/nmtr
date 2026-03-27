import { ipcMain, dialog, clipboard } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from './channels'
import { ProberManager } from '../prober/ProberManager'
import { fetchWhois } from '../enrichment/WhoisFetcher'
import { AppSettingsStore } from '../store/AppSettings'
import { HistoryStore } from '../store/HistoryStore'
import { formatExport } from '../export/ExportFormatter'
import { SessionPlayer } from '../recording/SessionPlayer'
import { checkForUpdates, downloadUpdate, quitAndInstall } from '../updater/AutoUpdater'
import type { TrayManager } from '../tray/TrayManager'
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

// Track session start times for history duration calculation
const sessionStartTimes = new Map<string, number>()

let _tray: TrayManager | null = null

export function setTrayManager(mgr: TrayManager): void {
  _tray = mgr
}

export function registerHandlers(win: BrowserWindow): void {
  ProberManager.setWindow(win)

  // ── Trace ──────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.TRACE_START, async (_e, payload: TraceStartPayload) => {
    console.log('[IPC] trace:start received — target=%s protocol=%s interval=%dms',
      payload?.config?.target, payload?.config?.protocol, payload?.config?.intervalMs)
    try {
      const result = await ProberManager.createSession(payload.config)
      sessionStartTimes.set(result.sessionId, Date.now())
      console.log('[IPC] trace:start success — sessionId=%s engineMode=%s', result.sessionId, result.engineMode)
      _tray?.updateMenu(ProberManager.getActiveSessions())
      return result
    } catch (err) {
      console.error('[IPC] trace:start FAILED — target=%s error:', payload?.config?.target, err)
      throw err
    }
  })

  ipcMain.handle(IPC.TRACE_STOP, async (_e, payload: TraceStopPayload) => {
    // Save history entry before stopping
    const session = ProberManager.getSession(payload.sessionId)
    if (session) {
      const startedAt = sessionStartTimes.get(payload.sessionId) ?? Date.now()
      const durationMs = Date.now() - startedAt
      const hops = session.getAllSnapshots()
      const hopsWithIp = hops.filter((h) => h.ip !== null)
      const avgLoss = hopsWithIp.length > 0
        ? hopsWithIp.reduce((sum, h) => sum + h.loss, 0) / hopsWithIp.length
        : 0
      const finalHop = hopsWithIp[hopsWithIp.length - 1]
      const { randomUUID } = await import('crypto')
      const entry = {
        id: randomUUID(),
        target: session.config.target,
        protocol: session.config.protocol,
        startedAt,
        durationMs,
        hopCount: hopsWithIp.length,
        avgLoss: Math.round(avgLoss * 10) / 10,
        avgRtt: finalHop?.avg ?? null,
        engineMode: session.currentEngineMode ?? 'native'
      }
      HistoryStore.add(entry)
      sessionStartTimes.delete(payload.sessionId)
      // Push new entry to renderer immediately so History view updates live
      if (!win.isDestroyed()) win.webContents.send(IPC.HISTORY_ENTRY_ADDED, entry)
    }
    ProberManager.stopSession(payload.sessionId)
    _tray?.updateMenu(ProberManager.getActiveSessions())
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

  // ── History ────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.HISTORY_GET, () => {
    return HistoryStore.getAll()
  })

  ipcMain.handle(IPC.HISTORY_CLEAR, () => {
    HistoryStore.clear()
  })

  ipcMain.handle(IPC.HISTORY_REMOVE, (_e, id: string) => {
    HistoryStore.remove(id)
  })

  // ── Auto-update ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    await checkForUpdates()
  })

  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    await downloadUpdate()
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    quitAndInstall()
  })
}
