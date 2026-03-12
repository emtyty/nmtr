import Store from 'electron-store'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS
})

// Migrate old default values to new ones
if ((store.get('maxHops') as number) === 64) {
  store.set('maxHops', 30)
}

export const AppSettingsStore = {
  get: (): AppSettings => store.store as AppSettings,
  set: (partial: Partial<AppSettings>): void => {
    for (const [k, v] of Object.entries(partial)) {
      store.set(k, v)
    }
  }
}
