import React from 'react'
import { useUIStore } from '../../store/useUIStore'
import type { NavView } from '../../store/useUIStore'

export type { NavView }

interface IconNavProps {
  activeView: NavView
  onNavigate: (view: NavView) => void
}

type NavItemDef =
  | { kind: 'view'; id: NavView; label: string; icon: React.ReactNode }
  | { kind: 'action'; label: string; icon: React.ReactNode; onAction: () => void }

const TracesIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="4" cy="10" r="2" />
    <circle cx="10" cy="4" r="2" />
    <circle cx="16" cy="10" r="2" />
    <circle cx="10" cy="16" r="2" />
    <path d="M6 10h2M12 10h2M10 6v2M10 12v2" strokeLinecap="round" />
  </svg>
)

const HistoryIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const LanIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="7" y="2" width="6" height="4" rx="1" />
    <rect x="1" y="14" width="6" height="4" rx="1" />
    <rect x="13" y="14" width="6" height="4" rx="1" />
    <path d="M10 6v3M10 9H4M10 9h6M4 9v5M16 9v5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const SpeedTestIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 14a7 7 0 0 1 14 0" strokeLinecap="round" />
    <path d="M10 11l4-4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="10" cy="11" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

const PortScanIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <path d="M6 7h2M6 10h2M6 13h2" strokeLinecap="round" />
    <circle cx="13" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="13" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="13" cy="13" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const DnsIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M2.5 10h15M10 2.5c2 2.2 3 4.8 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.8-3-7.5s1-5.3 3-7.5z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const SslIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="9" width="12" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" strokeLinecap="round" />
    <circle cx="10" cy="13" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

const WebScanIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="9" r="6" />
    <path d="M3.2 9h11.6M9 3.2c1.7 1.7 2.4 3.9 2.4 5.8s-.7 4.1-2.4 5.8c-1.7-1.7-2.4-3.9-2.4-5.8S7.3 4.9 9 3.2z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.2 13.2l4 4" strokeLinecap="round" />
  </svg>
)

const SettingsIcon = (
  <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" strokeLinecap="round" />
  </svg>
)

export function IconNav({ activeView, onNavigate }: IconNavProps): React.JSX.Element {
  const { openSettings } = useUIStore()

  const items: NavItemDef[] = [
    { kind: 'view', id: 'traces', label: 'Traces', icon: TracesIcon },
    { kind: 'view', id: 'history', label: 'History', icon: HistoryIcon },
    { kind: 'view', id: 'lan', label: 'LAN', icon: LanIcon },
    { kind: 'view', id: 'portscan', label: 'Ports', icon: PortScanIcon },
    { kind: 'view', id: 'speedtest', label: 'Speed', icon: SpeedTestIcon },
    { kind: 'view', id: 'dns', label: 'DNS', icon: DnsIcon },
    { kind: 'view', id: 'ssl', label: 'SSL', icon: SslIcon },
    { kind: 'view', id: 'pubscan', label: 'Web', icon: WebScanIcon },
    { kind: 'action', label: 'Settings', icon: SettingsIcon, onAction: openSettings }
  ]

  return (
    <div className="w-24 bg-canvas-subtle border-r border-border-default flex flex-col items-center py-3 gap-1 flex-shrink-0">
      {items.map((item) => {
        const isActive = item.kind === 'view' && item.id === activeView
        const onClick = item.kind === 'view'
          ? () => onNavigate(item.id)
          : item.onAction

        return (
          <button
            key={item.label}
            onClick={onClick}
            title={item.label}
            className={`flex flex-col items-center justify-center gap-1 w-[72px] h-[72px] rounded-lg transition-colors ${
              isActive
                ? 'bg-accent-blue/10 text-accent-blue'
                : 'text-fg-muted hover:text-fg-default hover:bg-canvas-hover'
            }`}
          >
            {item.icon}
            <span className="text-[13.5px] font-medium leading-none">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
