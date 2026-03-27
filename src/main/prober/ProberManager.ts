import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { ProberSession } from './ProberSession'
import type { TraceConfig } from '../../shared/types'

let win: BrowserWindow | null = null
const sessions = new Map<string, ProberSession>()

export const ProberManager = {
  async initialize(): Promise<void> {
    console.log('[ProberManager] Initialized')
  },

  setWindow(window: BrowserWindow): void {
    win = window
  },

  async createSession(config: TraceConfig): Promise<{ sessionId: string; engineMode: string }> {
    if (!win) throw new Error('No BrowserWindow registered')
    const sessionId = randomUUID()
    console.log(`[ProberManager] createSession — id=${sessionId} target=${config.target} protocol=${config.protocol} interval=${config.intervalMs}ms maxHops=${config.maxHops}`)
    const session = new ProberSession(sessionId, config, win)
    sessions.set(sessionId, session)
    console.log(`[ProberManager] Starting session ${sessionId}…`)
    try {
      const { engineMode } = await session.start()
      console.log(`[ProberManager] Session ${sessionId} ready — engineMode=${engineMode}`)
      return { sessionId, engineMode }
    } catch (err) {
      console.error(`[ProberManager] Session ${sessionId} failed to start:`, err)
      sessions.delete(sessionId)
      throw err
    }
  },

  stopSession(sessionId: string): void {
    sessions.get(sessionId)?.stop()
  },

  resetSession(sessionId: string): void {
    sessions.get(sessionId)?.reset()
  },

  getSession(sessionId: string): ProberSession | undefined {
    return sessions.get(sessionId)
  },

  startRecording(sessionId: string, filePath: string): void {
    sessions.get(sessionId)?.startRecording(filePath)
  },

  stopRecording(sessionId: string): string {
    return sessions.get(sessionId)?.stopRecording() ?? ''
  },

  getActiveSessions(): Array<{ id: string; target: string; status: string }> {
    return [...sessions.entries()].map(([id, session]) => ({
      id,
      target: session.config.target,
      status: session.currentStatus
    }))
  },

  destroyAll(): void {
    for (const session of sessions.values()) {
      session.stop()
    }
    sessions.clear()
  }
}
