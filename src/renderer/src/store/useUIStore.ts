import { create } from 'zustand'
import type { TracertResultEvent } from '@shared/types'

export type NavView = 'traces' | 'history' | 'lan' | 'wifi' | 'speedtest' | 'portscan' | 'dns' | 'ssl' | 'pubscan' | 'monitor'

export interface RuntimeAlert {
  id: string
  level: 'warn' | 'error'
  title: string
  message: string
  createdAt: number
}

interface UIState {
  activeView: NavView
  setActiveView: (view: NavView) => void

  // When navigating to the port-scan view from elsewhere (e.g. the LAN view),
  // this pre-fills the target field. Consumed (cleared) by PortScanView.
  portScanPrefill: string | null
  scanPortsFor: (target: string) => void   // set prefill + switch to portscan view
  clearPortScanPrefill: () => void

  // Pre-fill the Traces target from elsewhere (e.g. a port-scan row action).
  tracePrefill: string | null
  traceHost: (target: string) => void      // set prefill + switch to traces view
  clearTracePrefill: () => void

  // Pre-fill the DNS view target from elsewhere. Consumed (cleared) by DnsView.
  dnsPrefill: string | null
  resolveDnsFor: (target: string) => void   // set prefill + switch to dns view
  clearDnsPrefill: () => void

  // Pre-fill the SSL view host from elsewhere. Consumed (cleared) by SslView.
  sslPrefill: string | null
  scanSslFor: (host: string) => void        // set prefill + switch to ssl view
  clearSslPrefill: () => void

  // Pre-fill the Public Scan view from elsewhere. Consumed (cleared) by PublicScanView.
  pubScanPrefill: string | null
  webScanFor: (target: string) => void      // set prefill + switch to pubscan view
  clearPubScanPrefill: () => void

  // Global WHOIS dialog (so any view can trigger it).
  whoisIp: string | null
  openWhois: (ip: string) => void
  closeWhois: () => void

  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void

  tracertModalOpen: boolean
  tracertResult: TracertResultEvent | null
  showTracertResult: (result: TracertResultEvent) => void  // stores result, no auto-open
  openTracertModal: () => void
  closeTracertModal: () => void

  // Auto-update
  updateChecking: boolean
  updateInfo: { version: string } | null
  updateProgress: number | null // 0–100, null = not downloading
  updateDownloaded: boolean
  updateNotAvailable: boolean  // true briefly after a manual check finds no update
  updateError: string | null
  setUpdateChecking: (manual: boolean) => void
  setUpdateInfo: (info: { version: string }) => void
  setUpdateNotAvailable: (manual: boolean) => void
  setUpdateProgress: (percent: number | null) => void
  setUpdateDownloaded: (version: string) => void
  setUpdateError: (message: string | null) => void

  runtimeAlerts: RuntimeAlert[]
  pushRuntimeAlert: (alert: Omit<RuntimeAlert, 'createdAt'>) => void
  dismissRuntimeAlert: (id: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'traces',
  setActiveView: (view) => set({ activeView: view }),

  portScanPrefill: null,
  scanPortsFor: (target) => set({ portScanPrefill: target, activeView: 'portscan' }),
  clearPortScanPrefill: () => set({ portScanPrefill: null }),

  tracePrefill: null,
  traceHost: (target) => set({ tracePrefill: target, activeView: 'traces' }),
  clearTracePrefill: () => set({ tracePrefill: null }),

  dnsPrefill: null,
  resolveDnsFor: (target) => set({ dnsPrefill: target, activeView: 'dns' }),
  clearDnsPrefill: () => set({ dnsPrefill: null }),

  sslPrefill: null,
  scanSslFor: (host) => set({ sslPrefill: host, activeView: 'ssl' }),
  clearSslPrefill: () => set({ sslPrefill: null }),

  pubScanPrefill: null,
  webScanFor: (target) => set({ pubScanPrefill: target, activeView: 'pubscan' }),
  clearPubScanPrefill: () => set({ pubScanPrefill: null }),

  whoisIp: null,
  openWhois: (ip) => set({ whoisIp: ip }),
  closeWhois: () => set({ whoisIp: null }),

  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  tracertModalOpen: false,
  tracertResult: null,
  showTracertResult: (result) => set({ tracertResult: result }),  // store only, no auto-open
  openTracertModal: () => set({ tracertModalOpen: true }),
  closeTracertModal: () => set({ tracertModalOpen: false }),

  updateChecking: false,
  updateInfo: null,
  updateProgress: null,
  updateDownloaded: false,
  updateNotAvailable: false,
  updateError: null,
  setUpdateChecking: (manual) => set({ updateChecking: manual, updateError: null }),
  setUpdateInfo: (info) => set({ updateInfo: info, updateChecking: false, updateError: null }),
  setUpdateNotAvailable: (manual) => {
    if (!manual) return
    set({ updateNotAvailable: true, updateChecking: false })
    setTimeout(() => set({ updateNotAvailable: false }), 3000)
  },
  setUpdateProgress: (percent) => set({ updateProgress: percent }),
  setUpdateDownloaded: (version) => set({ updateDownloaded: true, updateProgress: null, updateInfo: { version } }),
  setUpdateError: (message) => set({ updateError: message, updateProgress: null, updateChecking: false }),

  runtimeAlerts: [],
  pushRuntimeAlert: (alert) => set((state) => ({
    runtimeAlerts: [{ ...alert, createdAt: Date.now() }, ...state.runtimeAlerts].slice(0, 6)
  })),
  dismissRuntimeAlert: (id) => set((state) => ({
    runtimeAlerts: state.runtimeAlerts.filter((a) => a.id !== id)
  }))
}))
