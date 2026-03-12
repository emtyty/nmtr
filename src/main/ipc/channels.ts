/**
 * IPC channel name constants.
 * Import from both main process and preload to avoid string duplication.
 */
export const IPC = {
  // Renderer → Main (invoke/handle)
  TRACE_START: 'trace:start',
  TRACE_STOP: 'trace:stop',
  TRACE_RESET: 'trace:reset',
  TRACE_EXPORT: 'trace:export',
  WHOIS_FETCH: 'whois:fetch',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  PLAYBACK_OPEN: 'playback:open',
  PLAYBACK_START: 'playback:start',
  PLAYBACK_SEEK: 'playback:seek',
  PLAYBACK_STOP: 'playback:stop',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // Main → Renderer (webContents.send / ipcRenderer.on)
  HOP_UPDATE: 'hop:update',     // single-hop (reset / enrichment)
  HOPS_BATCH: 'hops:batch',     // all hops after each probe round (reduces IPC calls)
  HOP_NEW: 'hop:new',
  DNS_RESOLVED: 'dns:resolved',
  HOP_ENRICHED: 'hop:enriched',
  SESSION_STATUS: 'session:status',
  PLAYBACK_FRAME: 'playback:frame'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
