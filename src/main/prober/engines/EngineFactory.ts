import type { IProberEngine } from './IProberEngine'
import { PingusEngine } from './PingusEngine'
import { NativeEngine } from './NativeEngine'

export type EngineMode = 'pingus' | 'native'

let cachedMode: EngineMode | null = null

/**
 * Detect whether the current process has administrator privileges.
 * Uses `is-elevated` npm package.
 */
async function detectElevated(): Promise<boolean> {
  try {
    const { default: isElevated } = await import('is-elevated')
    return await isElevated()
  } catch {
    // If is-elevated fails, assume non-elevated (safer)
    return false
  }
}

export const EngineFactory = {
  /**
   * Detect capabilities once and cache the result.
   * Call at app startup via ProberManager.initialize().
   */
  async detectMode(): Promise<EngineMode> {
    if (cachedMode) return cachedMode
    const elevated = await detectElevated()
    cachedMode = elevated ? 'pingus' : 'native'
    console.log(`[EngineFactory] Engine mode: ${cachedMode} (elevated=${elevated})`)
    return cachedMode
  },

  getMode(): EngineMode {
    return cachedMode ?? 'native'
  },

  /**
   * Create a new engine instance and verify it is usable.
   * If PingusEngine fails to load (e.g. raw-socket blocked by OS/AV),
   * automatically falls back to NativeEngine and updates the cached mode.
   */
  async createSafe(): Promise<{ engine: IProberEngine; mode: EngineMode }> {
    const mode = cachedMode ?? 'native'
    if (mode === 'pingus') {
      const engine = new PingusEngine()
      try {
        await engine.waitReady()
        return { engine, mode: 'pingus' }
      } catch (err) {
        console.warn('[EngineFactory] PingusEngine unavailable, falling back to NativeEngine:', err)
        cachedMode = 'native'
        engine.destroy()
        return { engine: new NativeEngine(), mode: 'native' }
      }
    }
    return { engine: new NativeEngine(), mode: 'native' }
  }
}
