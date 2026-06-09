import { useCallback, useState } from 'react'

const STORAGE_KEY = 'mailtub_settings_v1'

export type TTLHours = 1 | 6 | 24 | 168

export interface AppSettings {
  defaultTTLHours: TTLHours
  soundEnabled: boolean
  blockRemoteImages: boolean
}

const DEFAULTS: AppSettings = {
  defaultTTLHours: 24,
  soundEnabled: false,
  blockRemoteImages: false,
}

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return DEFAULTS
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(load)

  const setSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  return { settings, setSettings }
}

export const TTL_OPTIONS: { hours: TTLHours; label: string; short: string }[] = [
  { hours: 1,   label: '1 hour',   short: '1h' },
  { hours: 6,   label: '6 hours',  short: '6h' },
  { hours: 24,  label: '24 hours', short: '24h' },
  { hours: 168, label: '7 days',   short: '7d' },
]
