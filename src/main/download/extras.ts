import { writeFile } from 'node:fs/promises'
import type { DownloadOptions, MediaItem, Settings } from '@shared/types'
import { BASE_HEADERS } from '../bili/http'
import { fetchDanmakuXml, parseDanmakuXml, toAss } from '../bili/danmaku'
import { fetchSubtitles } from '../bili/subtitle'

/** 下载封面、字幕、弹幕。失败不影响主文件，返回给用户看的备注 */
export async function writeExtras(
  item: MediaItem,
  options: DownloadOptions,
  base: string,
  settings: Settings
): Promise<string | undefined> {
  const notes: string[] = []

  if (options.cover && item.cover) {
    try {
      const url = item.cover.replace(/^http:/, 'https:')
      const res = await fetch(url, { headers: BASE_HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await writeFile(`${base}.jpg`, Buffer.from(await res.arrayBuffer()))
    } catch (e) {
      notes.push(`封面失败：${(e as Error).message}`)
    }
  }

  if (options.subtitle && !options.audioOnly) {
    try {
      const subs = await fetchSubtitles(item)
      if (!subs.length) notes.push('没有 CC 字幕')
      for (const s of subs) await writeFile(`${base}.${s.lan}.srt`, s.srt)
    } catch (e) {
      notes.push(`字幕失败：${(e as Error).message}`)
    }
  }

  if (options.danmaku && !options.audioOnly) {
    try {
      const list = parseDanmakuXml(await fetchDanmakuXml(item.cid))
      await writeFile(`${base}.danmaku.ass`, toAss(list, settings.danmaku))
    } catch (e) {
      notes.push(`弹幕失败：${(e as Error).message}`)
    }
  }

  return notes.length ? notes.join('；') : undefined
}
