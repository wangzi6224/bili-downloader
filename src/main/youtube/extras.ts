// YouTube 的封面、字幕、章节（含 SponsorBlock 片段）：合并前放到任务的临时目录里，失败只记备注
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getLanguage, t } from '@shared/i18n'
import type { TaskInfo, YtOptions } from '@shared/types'
import { subtitleTrackMeta, toFfmetadataChapters, type ViewPoint } from '../bili/subtitle'
import { AbortError } from '../download/errors'
import type { PreparedExtras } from '../download/extras'
import type { YtChapter, YtVideoInfo } from './types'

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** 界面语言对应的 YouTube 字幕语言，按优先顺序 */
const UI_SUB_LANGS: Record<string, string[]> = {
  'zh-CN': ['zh-Hans', 'zh-CN', 'zh', 'zh-Hant', 'zh-TW', 'zh-HK'],
  en: ['en', 'en-US', 'en-GB'],
  ja: ['ja'],
  ko: ['ko'],
  fr: ['fr', 'fr-FR', 'fr-CA'],
  it: ['it'],
  ru: ['ru'],
  hi: ['hi']
}

export interface SubPlan {
  /** 人工字幕的语言 */
  manual: string[]
  /** 用自动生成字幕的语言（只用视频原语言的，机器翻译的很容易被 YouTube 限流） */
  auto: string[]
}

/**
 * 要下哪些字幕：选了语言就按选的；没选时用界面语言的人工字幕，没有就用视频原语言的人工字幕。
 * 开了自动字幕时，没有人工字幕的语言用自动生成的
 */
export function planSubtitles(info: Pick<YtVideoInfo, 'subtitles' | 'automatic_captions' | 'language'>, yt: Pick<YtOptions, 'subtitleLangs' | 'autoSubs'>, uiLang = getLanguage()): SubPlan {
  const manualLangs = Object.keys(info.subtitles ?? {}).filter((l) => l !== 'live_chat')
  const autoLangs = Object.keys(info.automatic_captions ?? {})
  const original = autoLangs.find((l) => l.endsWith('-orig'))?.replace(/-orig$/, '') ?? info.language ?? undefined
  const match = (pool: string[], lang: string): string | undefined =>
    pool.find((l) => l === lang) ?? pool.find((l) => l.toLowerCase().startsWith(`${lang.toLowerCase()}-`))
  let wanted = yt.subtitleLangs
  if (!wanted.length) {
    const ui = UI_SUB_LANGS[uiLang] ?? ['en']
    const hit = ui.map((l) => match(manualLangs, l)).find(Boolean)
    wanted = hit ? [hit] : original ? [original] : manualLangs.slice(0, 1)
  }
  const manual: string[] = []
  const auto: string[] = []
  for (const lang of wanted) {
    const m = match(manualLangs, lang)
    if (m) {
      if (!manual.includes(m)) manual.push(m)
      continue
    }
    if (!yt.autoSubs) continue
    // 原语言的自动字幕在 yt-dlp 里叫 xx-orig；其他语言是机器翻译的，只在明确选了时才要
    const orig = original && lang.split('-')[0] === original.split('-')[0] ? `${original}-orig` : undefined
    const a = (orig && autoLangs.includes(orig) ? orig : undefined) ?? (yt.subtitleLangs.length ? match(autoLangs, lang) : undefined)
    if (a && !auto.includes(a)) auto.push(a)
  }
  return { manual, auto }
}

/** SponsorBlock 片段的分类和显示名 */
export const SPONSOR_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic'] as const

export interface SponsorSegment {
  segment: [number, number]
  category: string
}

/**
 * 把 SponsorBlock 片段插进章节：片段本身成为一章，原来的章节在片段两侧被截开。
 * 没有原章节时整段视频算一章（用视频标题）
 */
export function mergeChapters(chapters: YtChapter[], segments: SponsorSegment[], duration: number, title: string): ViewPoint[] {
  const base: ViewPoint[] = chapters.length
    ? chapters.map((c) => ({ from: c.start_time, to: c.end_time, content: c.title }))
    : [{ from: 0, to: duration, content: title }]
  const segs = segments
    .map((s) => ({ from: Math.max(0, s.segment[0]), to: Math.min(duration || Infinity, s.segment[1]), content: `[SponsorBlock] ${t(`yt.sb_${s.category}` as 'yt.sb_sponsor')}` }))
    .filter((s) => s.to - s.from >= 1)
    .sort((a, b) => a.from - b.from)
  if (!segs.length) return base
  const out: ViewPoint[] = []
  for (const c of base) {
    let cursor = c.from
    for (const s of segs) {
      if (s.to <= cursor || s.from >= c.to) continue
      if (s.from > cursor) out.push({ from: cursor, to: s.from, content: c.content })
      cursor = Math.max(cursor, s.to)
    }
    if (cursor < c.to) out.push({ from: cursor, to: c.to, content: c.content })
  }
  out.push(...segs)
  // 片段有重叠时只留先开始的那个
  const sorted = out.sort((a, b) => a.from - b.from || a.to - b.to)
  return sorted.filter((p, i) => i === 0 || p.from >= sorted[i - 1].to - 0.001)
}

export interface YtExtrasDeps {
  /** 运行 yt-dlp（已带上账号 cookie） */
  exec: (args: string[], signal: AbortSignal) => Promise<unknown>
  fetch?: typeof fetch
  signal: AbortSignal
}

async function fetchCover(id: string, dest: string, f: typeof fetch, signal: AbortSignal): Promise<string> {
  // 高清视频有 maxres，老视频只有 hq
  let last = ''
  for (const name of ['maxresdefault', 'hqdefault']) {
    const res = await f(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { signal })
    if (res.ok) {
      await writeFile(dest, Buffer.from(await res.arrayBuffer()))
      return dest
    }
    await res.body?.cancel()
    last = `HTTP ${res.status}`
  }
  throw new Error(last)
}

export async function fetchSponsorSegments(id: string, f: typeof fetch, signal: AbortSignal): Promise<SponsorSegment[]> {
  const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(id)}&categories=${encodeURIComponent(JSON.stringify(SPONSOR_CATEGORIES))}`
  const res = await f(url, { signal })
  // 没有任何片段时返回 404
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as SponsorSegment[]
}

/** info.json 已经写在临时目录里（infoPath），字幕直接用它下载，不用再解析一次 */
export async function prepareYtExtras(t0: TaskInfo, tmp: string, info: YtVideoInfo, infoPath: string, d: YtExtrasDeps): Promise<PreparedExtras> {
  const o = t0.options
  const yt = { subtitleLangs: [], autoSubs: false, sponsorblock: 'off' as const, ...o.yt }
  const f = d.fetch ?? fetch
  const out: PreparedExtras = { subtitles: [], notes: [] }
  const audioOnly = o.output === 'audio'
  const check = (): void => {
    if (d.signal.aborted) throw new AbortError()
  }

  if (o.cover || o.embedCover || o.nfo) {
    try {
      out.cover = await fetchCover(info.id, join(tmp, 'cover.jpg'), f, d.signal)
    } catch (e) {
      check()
      out.notes.push(t('download.coverFailed', { error: msg(e) }))
    }
  }

  if (!audioOnly && (o.subtitle || o.embedSubtitle)) {
    const plan = planSubtitles(info, yt)
    if (!plan.manual.length && !plan.auto.length) {
      out.notes.push(t('yt.noSubtitles'))
    } else {
      try {
        await d.exec([
          '--load-info-json', infoPath,
          '--skip-download',
          // 某个语言下载失败（例如被限流）不影响其他语言
          '--ignore-errors',
          ...(plan.manual.length ? ['--write-subs'] : []),
          ...(plan.auto.length ? ['--write-auto-subs'] : []),
          '--sub-langs', [...plan.manual, ...plan.auto].join(','),
          '--convert-subs', 'srt',
          '-P', tmp,
          '-o', 'sub.%(ext)s'
        ], d.signal)
      } catch (e) {
        check()
        out.notes.push(t('download.subtitleFailed', { error: msg(e) }))
      }
      const files = new Set(await readdir(tmp))
      const names = new Map(Object.entries({ ...info.automatic_captions, ...info.subtitles }).map(([l, list]) => [l, list[0]?.name ?? l]))
      const missing: string[] = []
      for (const lang of [...plan.manual, ...plan.auto]) {
        const file = `sub.${lang}.srt`
        if (!files.has(file)) {
          missing.push(lang)
          continue
        }
        const lan = lang.replace(/-orig$/, '')
        const auto = plan.auto.includes(lang)
        const name = names.get(lang) ?? lan
        out.subtitles.push({ path: join(tmp, file), lan, ...subtitleTrackMeta({ lan, lan_doc: auto ? t('yt.autoSubTitle', { name }) : name }) })
      }
      if (missing.length) out.notes.push(t('yt.subtitleMissing', { langs: missing.join(', ') }))
    }
  }

  if (!audioOnly && o.chapters) {
    let segments: SponsorSegment[] = []
    if (yt.sponsorblock === 'mark') {
      try {
        segments = await fetchSponsorSegments(info.id, f, d.signal)
      } catch (e) {
        check()
        out.notes.push(t('yt.sponsorFailed', { error: msg(e) }))
      }
    }
    const points = mergeChapters(info.chapters ?? [], segments, info.duration ?? 0, info.title)
    if (info.chapters?.length || segments.length) {
      out.chapters = join(tmp, 'chapters.txt')
      await writeFile(out.chapters, toFfmetadataChapters(points))
    }
  }
  return out
}
