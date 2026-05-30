/**
 * IPC channel name constants.
 * Import from both main process and preload to avoid string duplication.
 */
export const IPC = {
  // Renderer → Main (invoke/handle)
  TRACE_START: 'trace:start',
  TRACE_PAUSE: 'trace:pause',
  TRACE_RESUME: 'trace:resume',
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
  PLAYBACK_FRAME: 'playback:frame',
  HOP_ROUTE_CHANGED: 'hop:routeChanged',
  SESSION_RESET: 'session:reset',
  TRACERT_RESULT: 'tracert:result',

  // History
  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_REMOVE: 'history:remove',
  HISTORY_ENTRY_ADDED: 'history:entryAdded', // main → renderer push

  // LAN Network (renderer → main invoke)
  LAN_SCAN: 'lan:scan',

  // Port scan / nmap (renderer → main invoke)
  PORTSCAN_CHECK: 'portscan:check',   // detect nmap availability
  PORTSCAN_START: 'portscan:start',
  PORTSCAN_CANCEL: 'portscan:cancel',
  PORTSCAN_EXPORT: 'portscan:export',
  PORTSCAN_HISTORY_GET: 'portscan:historyGet',
  PORTSCAN_HISTORY_CLEAR: 'portscan:historyClear',

  // Port scan (main → renderer push)
  PORTSCAN_PROGRESS: 'portscan:progress',
  PORTSCAN_DONE: 'portscan:done',

  // DNS resolve (renderer → main invoke)
  DNS_LOOKUP: 'dns:lookup',
  DNS_EXPORT: 'dns:export',
  DNS_HISTORY_GET: 'dns:historyGet',
  DNS_HISTORY_CLEAR: 'dns:historyClear',
  DNS_HISTORY_REMOVE: 'dns:historyRemove',
  DNS_PROPAGATION: 'dns:propagation',
  DNS_EMAIL: 'dns:email',
  DNS_FCRDNS: 'dns:fcrdns',
  DNS_DELEGATION: 'dns:delegation',

  // SSL scan (renderer → main invoke)
  SSL_RESOLVE: 'ssl:resolve',         // host → list of IP endpoints
  SSL_SCAN_START: 'ssl:scanStart',
  SSL_SCAN_CANCEL: 'ssl:scanCancel',
  SSL_EXPORT: 'ssl:export',
  SSL_HISTORY_GET: 'ssl:historyGet',
  SSL_HISTORY_CLEAR: 'ssl:historyClear',
  SSL_HISTORY_REMOVE: 'ssl:historyRemove',
  SSL_WATCH_GET: 'ssl:watchGet',
  SSL_WATCH_ADD: 'ssl:watchAdd',
  SSL_WATCH_REMOVE: 'ssl:watchRemove',

  // SSL scan (main → renderer push)
  SSL_PROGRESS: 'ssl:progress',
  SSL_DONE: 'ssl:done',

  // Shell (renderer → main invoke)
  OPEN_EXTERNAL: 'shell:openExternal',

  // Auto-update (renderer → main invoke)
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',

  // Auto-update (main → renderer push)
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_ERROR: 'update:error'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
