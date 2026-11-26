// 合并前准备封面、章节和弹幕。失败只记备注，不影响主文件。抖音没有字幕
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { t } from '@shared/i18n'
import type { Settings, TaskInfo } from '@shared/types'
import { toAss, type Danmaku } from '../bili/danmaku'
import { toFfmetadataChapters } from '../bili/subtitle'
import type { PreparedExtras } from '../download/extras'
import { runFfmpeg } from '../download/mux'
import { dyHeaders } from './ua'
import { awemeSeconds } from './resolve'
import type { DyAweme, DyDanmaku } from './types'

/** 弹幕接口按这么长的时间窗口取 */
const WINDOW = 32_000
/** 最多取这么多个窗口（约 32 分钟），免得长视频发太多请求 */
const MAX_WINDOWS = 60

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface DyExtrasDeps {
  fetch?: typeof fetch
  danmaku: (start: number, duration: number) => Promise<DyDanmaku[]>
}

/** 按文件头认图片格式：CDN 给的类型和地址后缀都不一定准 */
export function imageType(data: Buffer): 'jpg' | 'png' | 'webp' | undefined {
  if (data[0] === 0xff && data[1] === 0xd8) return 'jpg'
  if (data[0] === 0x89 && data.subarray(1, 4).toString('latin1') === 'PNG') return 'png'
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return undefined
}

/** 按文件头改正扩展名（链接里的后缀不一定对：配乐常是 M4A 却叫 mp3）；认不出的保持原名 */
export function sniffName(name: string, head: Buffer): string {
  const brand = head.subarray(4, 8).toString('latin1') === 'ftyp' ? head.subarray(8, 12).toString('latin1') : undefined
  const ext =
    imageType(head) ??
    (brand === 'heic' ? 'heic' : brand !== undefined ? (name.startsWith('music') ? 'm4a' : 'mp4') : undefined) ??
    (head.subarray(0, 3).toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) ? 'mp3' : undefined)
  return ext ? name.replace(/\.\w+$/, `.${ext}`) : name
}

/** 下载封面；webp 嵌不进视频，转成 jpg */
async function cover(url: string, tmp: string, signal: AbortSignal, f: typeof fetch): Promise<string> {
  const res = await f(url, { headers: dyHeaders(), signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  const type = imageType(data)
  if (!type) throw new Error(t('dy.errCoverFormat'))
  const path = join(tmp, `cover.${type}`)
  await writeFile(path, data)
  if (type !== 'webp') return path
  const jpg = join(tmp, 'cover.jpg')
  await runFfmpeg(['-i', path, '-frames:v', '1', jpg], signal)
  await readFile(jpg)
  return jpg
}

/** 作品的章节要点换成 FFMETADATA 用的起止时间（秒） */
export function chapterPoints(a: DyAweme): { content: string; from: number; to: number }[] {
  const end = awemeSeconds(a)
  const list = (a.chapter_list ?? [])
    .filter((c) => c.desc && typeof c.timestamp === 'number')
    .sort((x, y) => x.timestamp! - y.timestamp!)
  return list.map((c, i) => ({ content: c.desc!, from: c.timestamp! / 1000, to: i + 1 < list.length ? list[i + 1].timestamp! / 1000 : Math.max(end, c.timestamp! / 1000) }))
}

async function allDanmaku(durationMs: number, deps: DyExtrasDeps, signal: AbortSignal): Promise<Danmaku[]> {
  const seen = new Map<string, Danmaku>()
  const windows = Math.min(MAX_WINDOWS, Math.max(1, Math.ceil(durationMs / WINDOW)))
  for (let i = 0; i < windows && !signal.aborted; i++) {
    for (const d of await deps.danmaku(i * WINDOW, durationMs)) {
      if (!d.text) continue
      const time = (d.offset_time ?? 0) / 1000
      seen.set(d.danmaku_id ?? `${time}-${d.text}`, { time, mode: 1, size: 25, color: 0xffffff, text: d.text })
    }
  }
  return [...seen.values()].sort((a, b) => a.time - b.time)
}

const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 常见播放器认的 B站弹幕 XML 格式 */
export function danmakuXml(list: Danmaku[]): string {
  const lines = list.map((d) => `<d p="${d.time.toFixed(3)},${d.mode},${d.size},${d.color},0,0,0,0">${escapeXml(d.text)}</d>`)
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<i>', ...lines, '</i>', ''].join('\n')
}

export async function prepareDyExtras(
  task: TaskInfo,
  a: DyAweme,
  tmp: string,
  settings: Settings,
  signal: AbortSignal,
  deps: DyExtrasDeps
): Promise<PreparedExtras> {
  const o = task.options
  const out: PreparedExtras = { subtitles: [], notes: [] }
  const audioOnly = o.output === 'audio'

  if ((o.cover || o.embedCover || o.nfo) && task.item.cover) {
    try {
      // 条目里的封面地址可能是很久以前解析时的，优先用这次取到的
      const fresh = a.video?.origin_cover?.url_list?.[0] ?? a.video?.cover?.url_list?.[0] ?? task.item.cover
      out.cover = await cover(fresh, tmp, signal, deps.fetch ?? fetch)
    } catch (e) {
      out.notes.push(t('download.coverFailed', { error: msg(e) }))
    }
  }

  if (o.chapters && !audioOnly) {
    const points = chapterPoints(a)
    if (points.length) {
      out.chapters = join(tmp, 'chapters.txt')
      await writeFile(out.chapters, toFfmetadataChapters(points))
    }
  }

  if (o.danmaku && !audioOnly) {
    try {
      // 作品数据里写明一条弹幕都没有时就不发请求了
      const list = a.danmaku_control?.danmaku_cnt === 0 ? [] : await allDanmaku(a.video?.duration ?? a.duration ?? 0, deps, signal)
      if (o.danmakuFormat !== 'xml') {
        const portrait = (a.video?.height ?? 0) > (a.video?.width ?? 0)
        out.danmakuAss = join(tmp, 'danmaku.ass')
        await writeFile(out.danmakuAss, toAss(list, settings.danmaku, portrait ? { width: 1080, height: 1920 } : undefined))
      }
      if (o.danmakuFormat !== 'ass') {
        out.danmakuXml = join(tmp, 'danmaku.xml')
        await writeFile(out.danmakuXml, danmakuXml(list))
      }
    } catch (e) {
      out.notes.push(t('download.danmakuFailed', { error: msg(e) }))
    }
  }
  return out
}
