import React from 'react'
import { useUIStore } from '../../store/useUIStore'

export type NavView = 'traces' | 'history'

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
