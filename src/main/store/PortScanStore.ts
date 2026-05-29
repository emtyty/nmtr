import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type {
  PortScanRecord,
  PortScanResult,
  PortScanProtocol,
  PortScanDiff,
  PortInfo
} from '../../shared/types'

interface PortScanStoreSchema {
  records: PortScanRecord[]
}

// Lazy init — defers the sync file read out of the startup path.
let _store: Store<PortScanStoreSchema> | null = null
function store(): Store<PortScanStoreSchema> {
  if (!_store) {
    _store = new Store<PortScanStoreSchema>({
      name: 'nmtr-portscans',
      defaults: { records: [] }
    })
  }
  return _store
}

const MAX_RECORDS = 100

function openOf(ports: PortInfo[]): { port: number; protocol: string; service: string | null }[] {
  return ports
    .filter((p) => p.state.startsWith('open'))
    .map((p) => ({ port: p.port, protocol: p.protocol, service: p.service }))
}

const samePort = (
  a: { port: number; protocol: string },
  b: { port: number; protocol: string }
): boolean => a.port === b.port && a.protocol === b.protocol

export const PortScanStore = {
  getAll(): PortScanRecord[] {
    return store().get('records')
  },

  clear(): void {
    store().set('records', [])
  },

  /**
   * Diff a completed scan against the most recent prior scan of the same
   * target+protocol, then persist it (newest first). Returns the diff.
   */
  commit(result: PortScanResult, protocol: PortScanProtocol): PortScanDiff {
    const s = store()
    const records = s.get('records')
    const prior = records.find((r) => r.target === result.target && r.protocol === protocol)

    const openNow = openOf(result.ports)
    const diff: PortScanDiff = {
      previousScanAt: prior?.scannedAt ?? null,
      newlyOpened: prior
        ? openNow.filter((p) => !prior.openPorts.some((o) => samePort(o, p))).map((p) => p.port)
        : [],
      newlyClosed: prior
        ? prior.openPorts.filter((o) => !openNow.some((p) => samePort(p, o)))
        : []
    }

    const record: PortScanRecord = {
      id: randomUUID(),
      target: result.target,
      protocol,
      scannedAt: Date.now(),
      openPorts: openNow,
      openCount: openNow.length
    }
    records.unshift(record)
    if (records.length > MAX_RECORDS) records.splice(MAX_RECORDS)
    s.set('records', records)

    return diff
  }
}
