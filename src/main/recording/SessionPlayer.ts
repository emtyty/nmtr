import fs from 'fs'
import readline from 'readline'
import type { BrowserWindow } from 'electron'
import type { RecordingMeta, RecordingFrame, RecordingRouteChange } from '../../shared/types'
import { IPC } from '../ipc/channels'

export class SessionPlayer {
  private sessionId: string
  private window: BrowserWindow
  private frames: RecordingFrame[] = []
  private meta: RecordingMeta | null = null
  private frameIndex = 0
  private speed = 1
  private timer: NodeJS.Timeout | null = null
  private playing = false
  private routeChanges: RecordingRouteChange[] = []
  private routeChangeIdx = 0

  constructor(sessionId: string, window: BrowserWindow) {
    this.sessionId = sessionId
    this.window = window
  }

  /**
   * Load an .nmtr file into memory.
   * Returns meta + total duration.
   */
  async load(filePath: string): Promise<{ meta: RecordingMeta; durationMs: number; frameCount: number }> {
    this.frames = []
    this.routeChanges = []
    this.routeChangeIdx = 0
    this.meta = null
    this.frameIndex = 0

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    })

    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        if (obj.type === 'meta') {
          this.meta = obj as RecordingMeta
        } else if (obj.type === 'frame') {
          this.frames.push(obj as RecordingFrame)
        } else if (obj.type === 'routechange') {
          this.routeChanges.push(obj as RecordingRouteChange)
        }
      } catch {
        // Skip malformed lines
      }
    }

    const durationMs =
      this.frames.length > 0 ? this.frames[this.frames.length - 1].t : 0

    return {
      meta: this.meta!,
      durationMs,
      frameCount: this.frames.length
    }
  }

  play(speed = 1): void {
    if (this.playing) this.pause()
    this.speed = speed
    this.playing = true
    this.scheduleNext()
  }

  pause(): void {
    this.playing = false
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
  }

  seek(timestampMs: number): void {
    // Binary search for frame
    let lo = 0
    let hi = this.frames.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.frames[mid].t < timestampMs) lo = mid + 1
      else hi = mid
    }
    this.frameIndex = lo
    // Sync routeChangeIdx to match the seek position
    this.routeChangeIdx = this.routeChanges.findIndex((rc) => rc.t > timestampMs)
    if (this.routeChangeIdx === -1) this.routeChangeIdx = this.routeChanges.length
    this.emitFrame(this.frames[lo])
    if (this.playing) {
      if (this.timer) clearTimeout(this.timer)
      this.scheduleNext()
    }
  }

  stop(): void {
    this.pause()
    this.frameIndex = 0
    this.routeChangeIdx = 0
  }

  private scheduleNext(): void {
    if (!this.playing || this.frameIndex >= this.frames.length - 1) {
      this.playing = false
      return
    }
    const current = this.frames[this.frameIndex]
    const next = this.frames[this.frameIndex + 1]
    const delay = Math.max(0, (next.t - current.t) / this.speed)

    this.timer = setTimeout(() => {
      this.frameIndex++
      this.emitFrame(this.frames[this.frameIndex])
      this.scheduleNext()
    }, delay)
  }

  private emitFrame(frame: RecordingFrame): void {
    if (this.window.isDestroyed()) return

    // Emit any route changes that occurred up to this frame's timestamp
    while (
      this.routeChangeIdx < this.routeChanges.length &&
      this.routeChanges[this.routeChangeIdx].t <= frame.t
    ) {
      const rc = this.routeChanges[this.routeChangeIdx++]
      this.window.webContents.send(IPC.HOP_ROUTE_CHANGED, {
        sessionId: this.sessionId,
        hopIndex: rc.hopIndex,
        oldIP: rc.oldIP,
        newIP: rc.newIP,
        timestamp: (this.meta?.startedAt ?? 0) + rc.t
      })
    }

    this.window.webContents.send(IPC.PLAYBACK_FRAME, {
      sessionId: this.sessionId,
      frame,
      totalDurationMs: this.frames.length > 0 ? this.frames[this.frames.length - 1].t : 0,
      frameIndex: this.frameIndex,
      frameCount: this.frames.length
    })
  }
}
