import Store from 'electron-store'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS
})

// Batch first-run defaults and migrations into a single atomic write —
// electron-store v8 writes synchronously on every set(), so looping would
// block startup with one disk write per key.
{
  const current = store.store as Partial<AppSettings>
  const patch: Record<string, unknown> = {}
  if ((current.maxHops as number) === 64) patch.maxHops = 30
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (current[k as keyof AppSettings] === undefined) patch[k] = v
  }
  if (Object.keys(patch).length > 0) store.set(patch as Partial<AppSettings>)
}

export const AppSettingsStore = {
  get: (): AppSettings => store.store as AppSettings,
  set: (partial: Partial<AppSettings>): void => {
    for (const [k, v] of Object.entries(partial)) {
      store.set(k, v)
    }
  }
}
