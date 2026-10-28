import { join } from 'node:path'
import { app } from 'electron'
import type { Settings } from '@shared/types'
import { readJson, writeJson } from './store'

function defaults(): Settings {
  return {
    downloadDir: join(app.getPath('downloads'), 'Bilibili'),
    concurrency: 2,
    powerMode: 'display',
    defaultQn: 127,
    defaultCodec: 'avc',
    extras: { cover: false, subtitle: true, danmaku: false },
    danmaku: { fontSize: 25, opacity: 0.8, duration: 8 },
    clipboardWatch: true
  }
}

const file = (): string => join(app.getPath('userData'), 'settings.json')
const listeners = new Set<(s: Settings) => void>()
let cache: Settings | undefined

export function getSettings(): Settings {
  if (!cache) {
    const d = defaults()
    const saved = readJson<Partial<Settings>>(file()) ?? {}
    cache = {
      ...d,
      ...saved,
      extras: { ...d.extras, ...saved.extras },
      danmaku: { ...d.danmaku, ...saved.danmaku }
    }
  }
  return cache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  next.concurrency = Math.min(5, Math.max(1, Math.round(next.concurrency)))
  cache = next
  writeJson(file(), next)
  for (const fn of listeners) fn(next)
  return next
}

export function onSettingsChange(fn: (s: Settings) => void): void {
  listeners.add(fn)
}
