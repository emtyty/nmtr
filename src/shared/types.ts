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
}

// ─── App settings ─────────────────────────────────────────────────────────────

export interface AppSettings {
  theme: Theme
  defaultProtocol: Protocol
  defaultPort: number
  defaultIntervalMs: number
  defaultPacketSize: number
  maxHops: number
  resolveHostnames: boolean
  minimizeToTray: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultProtocol: 'icmp',
  defaultPort: 80,
  defaultIntervalMs: 500,
  defaultPacketSize: 64,
  maxHops: 30,
  resolveHostnames: true,
  minimizeToTray: true
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

export type RecordingLine = RecordingMeta | RecordingFrame

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
