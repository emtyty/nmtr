import { NativeEngine } from './NativeEngine'
import type { IProberEngine } from './IProberEngine'

export type EngineMode = 'pingus' | 'native'

export const EngineFactory = {
  /** Route discovery — always NativeEngine (tracert). */
  createDiscovery(): NativeEngine {
    return new NativeEngine()
  },

  /** RTT probe engine — NativeEngine (ping.exe, ICMP).
   *  PingusEngine (TCP/UDP) will be added here once stabilised. */
  async createProber(): Promise<{ engine: IProberEngine; mode: EngineMode }> {
    console.log('[EngineFactory] Probe engine: native')
    return { engine: new NativeEngine(), mode: 'native' }
  }
}
