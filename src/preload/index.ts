import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type {
  TraceStartPayload,
  TraceStartResult,
  TraceStopPayload,
  TraceResetPayload,
  ExportPayload,
  ExportResult,
  WhoisPayload,
  WhoisResult,
  AppSettings,
  RecordingStartPayload,
  RecordingStopPayload,
  RecordingStopResult,
  PlaybackOpenResult,
  PlaybackStartPayload,
  PlaybackSeekPayload,
  PlaybackStopPayload,
  HopUpdateEvent,
  HopsBatchEvent,
  HopNewEvent,
  DnsResolvedEvent,
  HopEnrichedEvent,
  SessionStatusEvent,
  PlaybackFrameEvent,
  RouteChangeEvent
} from '../shared/types'

type Unsubscribe = () => void

function on<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const handler = (_: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const nmtrAPI = {
  // ── Trace control ──────────────────────────────────────────────────────────
  traceStart: (payload: TraceStartPayload): Promise<TraceStartResult> =>
    ipcRenderer.invoke(IPC.TRACE_START, payload),
  traceStop: (payload: TraceStopPayload): Promise<void> =>
    ipcRenderer.invoke(IPC.TRACE_STOP, payload),
  traceReset: (payload: TraceResetPayload): Promise<void> =>
    ipcRenderer.invoke(IPC.TRACE_RESET, payload),
  traceExport: (payload: ExportPayload): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC.TRACE_EXPORT, payload),

  // ── Enrichment ─────────────────────────────────────────────────────────────
  whoisFetch: (payload: WhoisPayload): Promise<WhoisResult> =>
    ipcRenderer.invoke(IPC.WHOIS_FETCH, payload),

  // ── Settings ───────────────────────────────────────────────────────────────
  settingsGet: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  settingsSet: (settings: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, settings),

  // ── Recording ──────────────────────────────────────────────────────────────
  recordingStart: (payload: RecordingStartPayload): Promise<void> =>
    ipcRenderer.invoke(IPC.RECORDING_START, payload),
  recordingStop: (payload: RecordingStopPayload): Promise<RecordingStopResult> =>
    ipcRenderer.invoke(IPC.RECORDING_STOP, payload),

  // ── Playback ───────────────────────────────────────────────────────────────
  playbackOpen: (): Promise<PlaybackOpenResult | null> =>
    ipcRenderer.invoke(IPC.PLAYBACK_OPEN),
  playbackStart: (payload: PlaybackStartPayload): Promise<void> =>
    ipcRenderer.invoke(IPC.PLAYBACK_START, payload),
  playbackSeek: (payload: PlaybackSeekPayload): Promise<void> =>
    ipcRenderer.invoke(IPC.PLAYBACK_SEEK, payload),
  playbackStop: (payload: PlaybackStopPayload): Promise<void> =>
    ipcRenderer.invoke(IPC.PLAYBACK_STOP, payload),

  // ── Window controls ────────────────────────────────────────────────────────
  windowMinimize: (): void => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  windowMaximize: (): void => ipcRenderer.send(IPC.WINDOW_MAXIMIZE),
  windowClose: (): void => ipcRenderer.send(IPC.WINDOW_CLOSE),

  // ── Push event subscriptions (main → renderer) ────────────────────────────
  onHopUpdate: (cb: (e: HopUpdateEvent) => void): Unsubscribe =>
    on(IPC.HOP_UPDATE, cb),
  onHopsBatch: (cb: (e: HopsBatchEvent) => void): Unsubscribe =>
    on(IPC.HOPS_BATCH, cb),
  onHopNew: (cb: (e: HopNewEvent) => void): Unsubscribe =>
    on(IPC.HOP_NEW, cb),
  onDnsResolved: (cb: (e: DnsResolvedEvent) => void): Unsubscribe =>
    on(IPC.DNS_RESOLVED, cb),
  onHopEnriched: (cb: (e: HopEnrichedEvent) => void): Unsubscribe =>
    on(IPC.HOP_ENRICHED, cb),
  onSessionStatus: (cb: (e: SessionStatusEvent) => void): Unsubscribe =>
    on(IPC.SESSION_STATUS, cb),
  onPlaybackFrame: (cb: (e: PlaybackFrameEvent) => void): Unsubscribe =>
    on(IPC.PLAYBACK_FRAME, cb),
  onHopRouteChanged: (cb: (e: RouteChangeEvent) => void): Unsubscribe =>
    on(IPC.HOP_ROUTE_CHANGED, cb),
  onSessionReset: (cb: (e: { sessionId: string }) => void): Unsubscribe =>
    on(IPC.SESSION_RESET, cb)
}

contextBridge.exposeInMainWorld('nmtrAPI', nmtrAPI)

export type NmtrAPI = typeof nmtrAPI
