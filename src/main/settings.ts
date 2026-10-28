import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_TEMPLATES, validateTemplate } from '@shared/naming'
import { DEFAULT_OPTIONS, normalizeOptions } from '@shared/options'
import type { CodecPref, Settings } from '@shared/types'
import { readJson, writeJson } from './store'

function defaults(): Settings {
  return {
    downloadDir: join(app.getPath('downloads'), 'Bilibili'),
    concurrency: 2,
    powerMode: 'display',
    defaultQn: 127,
    defaults: { ...DEFAULT_OPTIONS },
    rememberLast: true,
    naming: { ...DEFAULT_TEMPLATES },
    duplicateAction: 'ask',
    danmaku: { fontSize: 25, opacity: 0.8, duration: 8 },
    clipboardWatch: true,
    threads: 4,
    speedLimit: 0,
    autoRetry: 5,
    notify: true,
    theme: 'system'
  }
}

/** 旧版设置里的字段 */
interface LegacySettings {
  defaultCodec?: CodecPref
  extras?: { cover: boolean; subtitle: boolean; danmaku: boolean }
}

const file = (): string => join(app.getPath('userData'), 'settings.json')
const listeners = new Set<(s: Settings) => void>()
let cache: Settings | undefined

function migrate(saved: Partial<Settings> & LegacySettings, d: Settings): Settings {
  const { defaultCodec, extras, ...rest } = saved
  const base = normalizeOptions({
    ...d.defaults,
    ...extras,
    ...(defaultCodec ? { codec: defaultCodec } : {}),
    ...saved.defaults
  })
  const { qn: _qn, ...opts } = base
  const naming = { ...d.naming, ...saved.naming }
  // 坏掉的模板（例如手改配置文件）回退到默认
  for (const k of Object.keys(naming) as (keyof typeof naming)[]) {
    if (validateTemplate(naming[k])) naming[k] = d.naming[k]
  }
  return { ...d, ...rest, defaults: opts, naming, danmaku: { ...d.danmaku, ...saved.danmaku } }
}

export function getSettings(): Settings {
  if (!cache) {
    const d = defaults()
    cache = migrate(readJson<Partial<Settings> & LegacySettings>(file()) ?? {}, d)
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
  if (patch.defaults) {
    const { qn: _qn, ...opts } = normalizeOptions(patch.defaults)
    next.defaults = opts
  }
  if (patch.naming) {
    for (const v of Object.values(patch.naming)) {
      const err = validateTemplate(v)
      if (err) throw new Error(`命名模板有误：${err}`)
    }
  }
  cache = next
  writeJson(file(), next)
  for (const fn of listeners) fn(next)
  return next
}

export function onSettingsChange(fn: (s: Settings) => void): void {
  listeners.add(fn)
}
