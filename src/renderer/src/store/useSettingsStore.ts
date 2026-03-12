import { create } from 'zustand'
import type { AppSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: (partial: Partial<AppSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const settings = await window.nmtrAPI.settingsGet()
      set({ settings, loaded: true })
      // Apply theme class to <html>
      applyTheme(settings.theme)
    } catch {
      set({ loaded: true })
    }
  },

  update: async (partial) => {
    await window.nmtrAPI.settingsSet(partial)
    const newSettings = { ...get().settings, ...partial }
    set({ settings: newSettings })
    if (partial.theme) applyTheme(partial.theme)
  }
}))

function applyTheme(theme: AppSettings['theme']): void {
  const html = document.documentElement
  if (theme === 'light') {
    html.classList.remove('dark')
    html.classList.add('light')
  } else {
    // 'dark' or 'system' — default to dark
    html.classList.remove('light')
    html.classList.add('dark')
  }
}
