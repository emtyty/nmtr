// ─── Core enums ──────────────────────────────────────────────────────────────

export type Protocol = 'icmp' | 'udp' | 'tcp'
export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped'
export type ExportFormat = 'text' | 'csv' | 'html'
export type Theme = 'dark' | 'light' | 'system'

// ─── Probe / engine types ─────────────────────────────────────────────────────

export interface TraceConfig {
  target: string
  protocol: Protocol
  port?: number // UDP/TCP only, default 80 for TCP
  intervalMs: number // default 1000
  packetSize: number // bytes, default 64
  maxHops: number // default 30
  useIPv6: boolean
  resolveHostnames: boolean
}

export interface ProbeOptions {
  protocol: Protocol
  port?: number
  packetSize: number
  timeoutMs: number
  useIPv6: boolean
}

export interface ProbeResult {
  fromIP: string // IP that replied (TTL-exceeded or echo-reply)
  rttMs: number // round-trip time in milliseconds
  isFinalHop: boolean // true = destination reached
  hopIndex: number // 1-based TTL used
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

export interface EnrichmentData {
  asn: string | null // "AS15169"
  isp: string | null // "Google LLC"
  country: string | null // "US"
  countryCode: string | null // "US"
  city: string | null
  lat: number | null
  lng: number | null
}

// ─── Per-hop statistics ───────────────────────────────────────────────────────

export interface HopStats {
  hopIndex: number // 1-based TTL
  ip: string | null // null = no response (* * *)
  hostname: string | null
  enrichment: EnrichmentData | null
  loss: number // 0.0–100.0 percent
  sent: number
  recv: number
  last: number | null // ms
  avg: number | null // ms
  best: number | null // ms
  worst: number | null // ms
  jitter: number | null // mean deviation ms (RFC 3550)
  sparkline: (number | null)[] // 60-point rolling ring buffer, newest at tail
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface TraceSession {
  id: string
  config: TraceConfig
  status: SessionStatus
  hops: HopStats[]
  startedAt: number // Date.now()
  elapsedMs: number
  totalSent: number
  isPlayback: boolean
  engineMode: 'pingus' | 'native' // which engine is active
  routeEvents: RouteChangeEvent[]  // IP changes detected during this session
  rttHistory: (number | null)[]   // final-hop RTT per probe round, newest at tail (max 300)
}

// ─── App settings ─────────────────────────────────────────────────────────────

export interface AppSettings {
  theme: Theme
  defaultProtocol: Protocol
  defaultPort: number
  defaultIntervalMs: number
  defaultPacketSize: number
  defaultUseIPv6: boolean
  maxHops: number
  resolveHostnames: boolean
  minimizeToTray: boolean
  alertsEnabled: boolean
  alertLossPct: number
  alertRttMs: number
  alertCooldownSec: number
  // Speed Test TURN relay (for packet-loss measurement). Empty = packet loss disabled.
  turnServerUri: string
  turnServerUser: string
  turnServerPass: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultProtocol: 'icmp',
  defaultPort: 80,
  defaultIntervalMs: 500,
  defaultPacketSize: 64,
  defaultUseIPv6: false,
  maxHops: 30,
  resolveHostnames: true,
  minimizeToTray: true,
  alertsEnabled: false,
  alertLossPct: 20,
  alertRttMs: 200,
  alertCooldownSec: 30,
  turnServerUri: '',
  turnServerUser: '',
  turnServerPass: ''
}

// ─── Recording / Playback ─────────────────────────────────────────────────────

export interface RecordingMeta {
  type: 'meta'
  version: string // app version
  target: string
  startedAt: number
  protocol: Protocol
  intervalMs: number
}

export interface RecordingFrame {
  type: 'frame'
  t: number // ms since startedAt
  hops: HopStats[]
}

export interface RecordingRouteChange {
  type: 'routechange'
  t: number        // ms since session startedAt
  hopIndex: number
  oldIP: string
  newIP: string
}

export type RecordingLine = RecordingMeta | RecordingFrame | RecordingRouteChange

// ─── Route change ─────────────────────────────────────────────────────────────

export interface RouteChangeEvent {
  sessionId: string
  hopIndex: number  // 1-based TTL
  oldIP: string
  newIP: string
  timestamp: number // Date.now()
}

// ─── IPC payload types ────────────────────────────────────────────────────────

export interface TraceStartPayload {
  config: TraceConfig
}
export interface TraceStartResult {
  sessionId: string
  engineMode: 'pingus' | 'native'
}

export interface TraceStopPayload {
  sessionId: string
}
export interface TracePausePayload {
  sessionId: string
}
export interface TraceResumePayload {
  sessionId: string
}
export interface TraceResetPayload {
  sessionId: string
}

export interface ExportPayload {
  sessionId: string
  format: ExportFormat
}
export interface ExportResult {
  content: string
  mimeType: string
  suggestedFilename: string
}

export interface WhoisPayload {
  ip: string
}
export interface WhoisResult {
  raw: string
}

export interface RecordingStartPayload {
  sessionId: string
  filePath: string
}
export interface RecordingStopPayload {
  sessionId: string
}
export interface RecordingStopResult {
  filePath: string
}

export interface PlaybackOpenResult {
  sessionId: string
  filePath: string
  meta: RecordingMeta
  durationMs: number
  frameCount: number
}
export interface PlaybackStartPayload {
  sessionId: string
  filePath: string
  speed: number
}
export interface PlaybackSeekPayload {
  sessionId: string
  timestampMs: number
}
export interface PlaybackStopPayload {
  sessionId: string
}

// ─── Trace history ────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  target: string
  protocol: Protocol
  startedAt: number   // Date.now()
  durationMs: number
  hopCount: number    // number of hops with IPs
  avgLoss: number     // average loss% across all hops (0–100)
  avgRtt: number | null  // average RTT of final hop, ms
  engineMode: string
}

// ─── LAN Network ─────────────────────────────────────────────────────────────

export type DeviceType = 'router' | 'ap' | 'laptop' | 'desktop' | 'phone' | 'tablet'
  | 'camera' | 'iot' | 'printer' | 'media' | 'server' | 'unknown'

export interface NetworkInterface {
  name: string          // e.g. "Ethernet", "Wi-Fi"
  ip: string            // local IP
  mac: string           // MAC address
  netmask: string       // e.g. "255.255.255.0"
  gateway: string | null
  type: 'ethernet' | 'wifi' | 'vpn' | 'warp' | 'loopback' | 'other'
  cidr: string          // e.g. "192.168.1.0/24"
}

export interface LanDevice {
  ip: string
  mac: string | null
  hostname: string | null
  vendor: string | null       // OUI vendor from MAC
  deviceType: DeviceType
  isRandomizedMac: boolean    // true if MAC is locally administered (randomized)
  responseTimeMs: number | null
  isGateway: boolean
  isSelf: boolean
}

export interface LanScanResult {
  interfaces: NetworkInterface[]
  devices: LanDevice[]
  vpnDetected: boolean
  vpnInterfaces: NetworkInterface[]  // subset of interfaces with type vpn/warp
  scanDurationMs: number
}

export type LanScanPayload = Record<string, never>  // no params needed

// ─── Tracert discovery result ─────────────────────────────────────────────────

export interface TracertResultEvent {
  sessionId: string
  target: string
  rawOutput: string          // full stdout+stderr from tracert
  hops: { ttl: number; ip: string }[]  // successfully parsed hops
  error: string | null       // spawn error message, or null on success
}

// ─── Port scan (nmap) ─────────────────────────────────────────────────────────

export type PortScanProtocol = 'tcp' | 'udp'
export type PortScanPreset = 'top100' | 'top1000' | 'all' | 'custom'
export type PortState = 'open' | 'closed' | 'filtered' | 'open|filtered' | 'unfiltered'

export interface PortScanConfig {
  target: string                 // host, IP, or CIDR
  protocol: PortScanProtocol
  preset: PortScanPreset
  customPorts: string            // nmap -p value when preset === 'custom', e.g. "22,80,443,8000-8100"
  serviceDetection: boolean      // -sV (service + version/banner)
}

export interface PortInfo {
  port: number
  protocol: string               // "tcp" | "udp"
  state: PortState
  service: string | null         // e.g. "https"
  product: string | null         // banner product, e.g. "nginx"
  version: string | null         // banner version, e.g. "1.24.0"
  extraInfo: string | null       // e.g. "Ubuntu"
}

/** Open ports that changed since the previous scan of the same target+protocol. */
export interface PortScanDiff {
  previousScanAt: number | null  // when the compared prior scan ran; null = no prior scan
  newlyOpened: number[]          // ports open now but not in the prior scan
  newlyClosed: { port: number; protocol: string; service: string | null }[] // open before, gone now
}

export interface PortScanResult {
  scanId: string
  target: string
  protocol: PortScanProtocol
  resolvedIp: string | null
  hostUp: boolean
  ports: PortInfo[]
  closedCount: number            // ports nmap grouped as closed (extraports)
  filteredCount: number          // ports nmap grouped as filtered (extraports)
  startedAt: number              // Date.now()
  durationMs: number
  nmapVersion: string | null
  diff: PortScanDiff | null      // change vs previous scan of this target (null if none)
  error: string | null           // null on success
}

/** Persisted summary of a completed scan (for history + diffing). */
export interface PortScanRecord {
  id: string
  target: string
  protocol: PortScanProtocol
  scannedAt: number
  openPorts: { port: number; protocol: string; service: string | null }[]
  openCount: number
}

export type PortScanExportFormat = 'csv' | 'html' | 'json'
export interface PortScanExportPayload {
  result: PortScanResult
  format: PortScanExportFormat
}
export interface OpenExternalPayload {
  url: string
}

export interface PortScanStartPayload {
  config: PortScanConfig
}
export interface PortScanStartResult {
  scanId: string
}
export interface PortScanCancelPayload {
  scanId: string
}
export interface NmapCheckResult {
  available: boolean
  version: string | null
  path: string | null
}

// Main → renderer push events
export interface PortScanProgressEvent {
  scanId: string
  percent: number | null         // 0–100, null if unknown
  message: string | null         // status line, e.g. "Service scan"
  openPort: { port: number; protocol: string } | null  // newly discovered open port
}
export interface PortScanDoneEvent {
  scanId: string
  result: PortScanResult
}

// ─── IPC push event payloads (main → renderer) ───────────────────────────────

export interface HopUpdateEvent {
  sessionId: string
  hopStats: HopStats
}
export interface HopsBatchEvent {
  sessionId: string
  hops: HopStats[]
}
export interface HopNewEvent {
  sessionId: string
  hopIndex: number
  ip: string
}
export interface DnsResolvedEvent {
  sessionId: string
  hopIndex: number
  hostname: string
}
export interface HopEnrichedEvent {
  sessionId: string
  hopIndex: number
  enrichment: EnrichmentData
}
export interface SessionStatusEvent {
  sessionId: string
  status: SessionStatus
  elapsedMs: number
  totalSent: number
}
export interface PlaybackFrameEvent {
  sessionId: string
  frame: RecordingFrame
  totalDurationMs: number
  frameIndex: number
  frameCount: number
}
