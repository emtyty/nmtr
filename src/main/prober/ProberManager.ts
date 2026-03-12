import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { EngineFactory } from './engines/EngineFactory'
import { ProberSession } from './ProberSession'
import type { TraceConfig } from '../../shared/types'

let win: BrowserWindow | null = null
const sessions = new Map<string, ProberSession>()

export const ProberManager = {
  async initialize(): Promise<void> {
    await EngineFactory.detectMode()
    console.log('[ProberManager] Initialized, engine mode:', EngineFactory.getMode())
  },

  setWindow(window: BrowserWindow): void {
    win = window
  },

  async createSession(config: TraceConfig): Promise<{ sessionId: string; engineMode: string }> {
    if (!win) throw new Error('No BrowserWindow registered')
    const sessionId = randomUUID()
    const session = new ProberSession(sessionId, config, win)
    sessions.set(sessionId, session)
    await session.start()
    return { sessionId, engineMode: EngineFactory.getMode() }
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

  destroyAll(): void {
    for (const session of sessions.values()) {
      session.stop()
    }
    sessions.clear()
  }
}
