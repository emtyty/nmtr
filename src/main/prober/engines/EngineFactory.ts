import { NativeEngine } from './NativeEngine'
import type { IProberEngine } from './IProberEngine'
import type { TraceConfig } from '../../../shared/types'

export type EngineMode = 'pingus' | 'native'

export const EngineFactory = {
  /** Route discovery — always NativeEngine (tracert). */
  createDiscovery(): NativeEngine {
    return new NativeEngine()
  },

  /** RTT probe engine — NativeEngine (ping.exe, ICMP).
   *  PingusEngine (TCP/UDP) will be added here once stabilised. */
  async createProber(config: TraceConfig): Promise<{ engine: IProberEngine; mode: EngineMode }> {
    console.log(`[EngineFactory] Probe engine: native (ipv6=${config.useIPv6 ? 'on' : 'off'})`)
    return { engine: new NativeEngine(), mode: 'native' }
  }
}
