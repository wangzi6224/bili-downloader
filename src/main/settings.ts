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
    clipboardWatch: true,
    threads: 4,
    speedLimit: 0,
    autoRetry: 5,
    notify: true,
    theme: 'system'
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
  const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n) || lo))
  next.concurrency = clamp(next.concurrency, 1, 5)
  next.threads = clamp(next.threads, 1, 8)
  next.autoRetry = clamp(next.autoRetry, 0, 20)
  next.speedLimit = Math.max(0, Math.round(next.speedLimit) || 0)
  cache = next
  writeJson(file(), next)
  for (const fn of listeners) fn(next)
  return next
}

export function onSettingsChange(fn: (s: Settings) => void): void {
  listeners.add(fn)
}
