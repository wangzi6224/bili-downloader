import { existsSync } from 'node:fs'
import { copyFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Settings, TaskInfo } from '@shared/types'
import { fetchDanmakuXml, parseDanmakuXml, toAss } from '../bili/danmaku'
import { AuthExpiredError, BASE_HEADERS } from '../bili/http'
import { downloadSubtitle, fetchPlayerMeta, subtitleTrackMeta, toFfmetadataChapters } from '../bili/subtitle'
import { episodeNfo, movieNfo, tvshowNfo } from './nfo'

export interface PreparedExtras {
  cover?: string
  subtitles: { path: string; lan: string; language: string; title: string }[]
  chapters?: string
  danmakuAss?: string
  danmakuXml?: string
  notes: string[]
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

async function downloadImage(url: string, destNoExt: string): Promise<string> {
  const res = await fetch(url.replace(/^http:/, 'https:').replace(/^\/\//, 'https://'), { headers: BASE_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  const ext = type.includes('png') || /\.png$/i.test(url) ? '.png' : '.jpg'
  const path = destNoExt + ext
  await writeFile(path, Buffer.from(await res.arrayBuffer()))
  return path
}

/** 合并前把封面、字幕、章节、弹幕下载到临时目录。失败只记备注，不影响主文件 */
export async function prepareExtras(t: TaskInfo, tmp: string, settings: Settings): Promise<PreparedExtras> {
  const o = t.options
  const item = t.item
  const out: PreparedExtras = { subtitles: [], notes: [] }
  const audioOnly = o.output === 'audio'

  if ((o.cover || o.embedCover || o.nfo) && item.cover) {
    try {
      out.cover = await downloadImage(item.cover, join(tmp, 'cover'))
    } catch (e) {
      out.notes.push(`封面下载失败：${msg(e)}`)
    }
  }

  const wantSubs = !audioOnly && (o.subtitle || o.embedSubtitle)
  const wantChapters = !audioOnly && o.chapters
  if (wantSubs || wantChapters) {
    try {
      const meta = await fetchPlayerMeta(item)
      if (wantSubs) {
        if (!meta.tracks.length) out.notes.push('没有 CC 字幕')
        for (const track of meta.tracks) {
          const srt = await downloadSubtitle(track)
          if (!srt) continue
          const path = join(tmp, `sub.${track.lan}.srt`)
          await writeFile(path, srt)
          out.subtitles.push({ path, lan: track.lan, ...subtitleTrackMeta(track) })
        }
      }
      if (wantChapters && meta.viewPoints.length) {
        out.chapters = join(tmp, 'chapters.txt')
        await writeFile(out.chapters, toFfmetadataChapters(meta.viewPoints))
      }
    } catch (e) {
      if (e instanceof AuthExpiredError) throw e
      out.notes.push(`字幕/章节获取失败：${msg(e)}`)
    }
  }

  if (o.danmaku && !audioOnly) {
    try {
      const xml = await fetchDanmakuXml(item.cid)
      if (o.danmakuFormat !== 'xml') {
        out.danmakuAss = join(tmp, 'danmaku.ass')
        await writeFile(out.danmakuAss, toAss(parseDanmakuXml(xml), settings.danmaku))
      }
      if (o.danmakuFormat !== 'ass') {
        out.danmakuXml = join(tmp, 'danmaku.xml')
        await writeFile(out.danmakuXml, xml)
      }
    } catch (e) {
      out.notes.push(`弹幕下载失败：${msg(e)}`)
    }
  }
  return out
}

/**
 * 合并后把需要单独保存的附加内容放到成品旁边。embedded 为 false 表示嵌入失败，
 * 这时原本要嵌入的封面和字幕也改为单独保存。
 */
export async function placeSidecars(
  t: TaskInfo,
  p: PreparedExtras,
  outBase: string,
  embedded: boolean
): Promise<string[]> {
  const o = t.options
  const notes: string[] = []
  const tryDo = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn()
    } catch (e) {
      notes.push(`${label}保存失败：${msg(e)}`)
    }
  }
  if (!embedded && (o.embedCover || o.embedSubtitle || o.chapters)) notes.push('封面/字幕/章节写入视频失败，已改为单独保存')

  if (p.cover && (o.cover || (o.embedCover && !embedded))) {
    await tryDo('封面', () => copyFile(p.cover!, outBase + p.cover!.slice(p.cover!.lastIndexOf('.'))))
  }
  if (o.subtitle || (o.embedSubtitle && !embedded)) {
    for (const s of p.subtitles) await tryDo('字幕', () => copyFile(s.path, `${outBase}.${s.lan}.srt`))
  }
  if (p.danmakuAss) await tryDo('弹幕', () => copyFile(p.danmakuAss!, `${outBase}.danmaku.ass`))
  if (p.danmakuXml) await tryDo('弹幕', () => copyFile(p.danmakuXml!, `${outBase}.danmaku.xml`))

  if (o.nfo) {
    await tryDo('NFO', async () => {
      if (t.series) {
        const dir = dirname(outBase)
        await writeFile(`${outBase}.nfo`, episodeNfo(t.item, t.groupTitle))
        if (!existsSync(join(dir, 'tvshow.nfo'))) await writeFile(join(dir, 'tvshow.nfo'), tvshowNfo(t.groupTitle, t.meta))
        if (t.seriesCover && !existsSync(join(dir, 'poster.jpg')) && !existsSync(join(dir, 'poster.png'))) {
          await downloadImage(t.seriesCover, join(dir, 'poster'))
        }
      } else {
        await writeFile(`${outBase}.nfo`, movieNfo(t.item, t.meta, t.groupTitle))
        // 媒体库用“同名-poster”识别海报；用户已选择保存封面时就不重复存
        if (p.cover && !o.cover) await copyFile(p.cover, `${outBase}-poster${p.cover.slice(p.cover.lastIndexOf('.'))}`)
      }
    })
  }
  return notes
}
