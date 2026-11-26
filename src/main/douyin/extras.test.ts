import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { normalizeOptions } from '@shared/options'
import type { DownloadOptions, Settings, TaskInfo } from '@shared/types'
import { toAss } from '../bili/danmaku'
import { toFfmetadataChapters } from '../bili/subtitle'
import { runFfmpeg } from '../download/mux'
import { chapterPoints, danmakuXml, imageType, prepareDyExtras, sniffName, type DyExtrasDeps } from './extras'
import type { DyAweme, DyDanmaku } from './types'
import { dyHeaders } from './ua'

vi.mock('../download/mux', () => ({ runFfmpeg: vi.fn() }))

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])
const PNG = Buffer.from('\x89PNG\r\n', 'latin1')
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')
const SETTINGS = { danmaku: { fontSize: 25, opacity: 0.8, duration: 8 } } as Settings

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dy-extras-'))
  vi.mocked(runFfmpeg).mockReset()
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

const task = (options: Partial<DownloadOptions> = {}, cover: string | undefined = 'https://img.example.com/old.jpg'): TaskInfo =>
  ({
    id: 't1',
    item: { key: 'dy:1', kind: 'douyin', title: '示例', index: 1, cid: 0, cover },
    options: normalizeOptions({ cover: false, embedCover: false, nfo: false, chapters: false, danmaku: false, ...options }, 0)
  }) as TaskInfo

const WORK: DyAweme = { aweme_id: '7000000000000000001', video: { duration: 40_000, width: 1920, height: 1080 } }

function run(
  options: Partial<DownloadOptions>,
  o: { work?: DyAweme; task?: TaskInfo; body?: Buffer; status?: number; danmaku?: DyExtrasDeps['danmaku']; signal?: AbortSignal } = {}
) {
  const fetchFn = vi.fn(async () => new Response(new Uint8Array(o.body ?? JPG), { status: o.status ?? 200 }))
  const danmaku = vi.fn(o.danmaku ?? (async () => []))
  const signal = o.signal ?? new AbortController().signal
  const result = prepareDyExtras(o.task ?? task(options), o.work ?? WORK, tmp, SETTINGS, signal, { fetch: fetchFn as unknown as typeof fetch, danmaku })
  return { result, fetchFn, danmaku, signal }
}

describe('imageType', () => {
  it('按文件头认格式', () => {
    expect(imageType(JPG)).toBe('jpg')
    expect(imageType(PNG)).toBe('png')
    expect(imageType(WEBP)).toBe('webp')
    expect(imageType(Buffer.from('RIFF\0\0\0\0WAVE', 'latin1'))).toBeUndefined()
    expect(imageType(Buffer.from([0xff, 0x00]))).toBeUndefined()
    expect(imageType(Buffer.from([0x89, 0x00]))).toBeUndefined()
    expect(imageType(Buffer.alloc(0))).toBeUndefined()
  })
})

describe('chapterPoints', () => {
  it('按时间排序，下一章的开头是上一章的结尾，最后一章到视频结束', () => {
    const work: DyAweme = {
      ...WORK,
      chapter_list: [
        { desc: '后半', timestamp: 20_000 },
        { desc: '开头', timestamp: 0 },
        { desc: '', timestamp: 5000 },
        { desc: '没有时间' }
      ]
    }
    expect(chapterPoints(work)).toEqual([
      { content: '开头', from: 0, to: 20 },
      { content: '后半', from: 20, to: 40 }
    ])
  })

  it('章节开头超过时长时结尾不早于开头', () => {
    expect(chapterPoints({ ...WORK, chapter_list: [{ desc: 'a', timestamp: 50_000 }] })).toEqual([{ content: 'a', from: 50, to: 50 }])
  })

  it('没有章节', () => {
    expect(chapterPoints({ ...WORK, chapter_list: null })).toEqual([])
  })
})

describe('danmakuXml', () => {
  it('写成 B站弹幕格式并转义', () => {
    expect(danmakuXml([{ time: 1.5, mode: 1, size: 25, color: 16777215, text: `a<b>&"c"` }])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<i>\n<d p="1.500,1,25,16777215,0,0,0,0">a&lt;b&gt;&amp;&quot;c&quot;</d>\n</i>\n'
    )
  })
})

describe('封面', () => {
  it('什么都没开时不做任何事', async () => {
    const { result, fetchFn, danmaku } = run({})
    await expect(result).resolves.toEqual({ subtitles: [], notes: [] })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(danmaku).not.toHaveBeenCalled()
  })

  it.each([{ cover: true }, { embedCover: true }, { nfo: true }])('需要封面时下载 %o', async (options) => {
    const { result, fetchFn, signal } = run(options)
    const out = await result
    expect(out.cover).toBe(join(tmp, 'cover.jpg'))
    expect(readFileSync(out.cover!)).toEqual(JPG)
    expect(fetchFn).toHaveBeenCalledWith('https://img.example.com/old.jpg', { headers: dyHeaders(), signal })
  })

  it('优先用这次取到的封面地址', async () => {
    const origin = run({ cover: true }, { work: { ...WORK, video: { origin_cover: { url_list: ['https://img.example.com/origin'] } } } })
    await origin.result
    expect(origin.fetchFn).toHaveBeenCalledWith('https://img.example.com/origin', expect.anything())
    const normal = run({ cover: true }, { work: { ...WORK, video: { cover: { url_list: ['https://img.example.com/cover'] } } } })
    await normal.result
    expect(normal.fetchFn).toHaveBeenCalledWith('https://img.example.com/cover', expect.anything())
    const none = run({ cover: true }, { work: { aweme_id: '1' } })
    await none.result
    expect(none.fetchFn).toHaveBeenCalledWith('https://img.example.com/old.jpg', expect.anything())
  })

  it('条目没有封面时不下载', async () => {
    const { result, fetchFn } = run({}, { task: task({ cover: true }, '') })
    await expect(result).resolves.toEqual({ subtitles: [], notes: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('png 原样保存', async () => {
    const out = await run({ cover: true }, { body: PNG }).result
    expect(out.cover).toBe(join(tmp, 'cover.png'))
    expect(runFfmpeg).not.toHaveBeenCalled()
  })

  it('webp 转成 jpg', async () => {
    vi.mocked(runFfmpeg).mockImplementation(async (args) => writeFileSync(args.at(-1)!, JPG))
    const { result, signal } = run({ cover: true }, { body: WEBP })
    const out = await result
    expect(out.cover).toBe(join(tmp, 'cover.jpg'))
    expect(runFfmpeg).toHaveBeenCalledWith(['-i', join(tmp, 'cover.webp'), '-frames:v', '1', join(tmp, 'cover.jpg')], signal)
  })

  it('转换后没有生成文件时只记备注', async () => {
    const out = await run({ cover: true }, { body: WEBP }).result
    expect(out.cover).toBeUndefined()
    expect(out.notes).toHaveLength(1)
    expect(out.notes[0]).toContain('ENOENT')
  })

  it('下载失败或格式不认识时记备注', async () => {
    const http = await run({ cover: true }, { status: 403 }).result
    expect(http.notes).toEqual([t('download.coverFailed', { error: 'HTTP 403' })])
    const format = await run({ cover: true }, { body: Buffer.from('<html>') }).result
    expect(format.notes).toEqual([t('download.coverFailed', { error: t('dy.errCoverFormat') })])
    expect(format.cover).toBeUndefined()
  })

  it('抛出的不是 Error 时直接写进备注', async () => {
    vi.mocked(runFfmpeg).mockRejectedValue('转换器坏了')
    const out = await run({ cover: true }, { body: WEBP }).result
    expect(out.notes).toEqual([t('download.coverFailed', { error: '转换器坏了' })])
  })

  it('缺省用全局 fetch', async () => {
    const fake = vi.fn(async () => new Response(new Uint8Array(JPG)))
    vi.stubGlobal('fetch', fake)
    const out = await prepareDyExtras(task({ cover: true }), WORK, tmp, SETTINGS, new AbortController().signal, { danmaku: async () => [] })
    expect(out.cover).toBe(join(tmp, 'cover.jpg'))
    expect(fake).toHaveBeenCalledTimes(1)
  })
})

describe('章节', () => {
  const work: DyAweme = { ...WORK, chapter_list: [{ desc: '开头', timestamp: 0 }] }

  it('写成 FFMETADATA 文件', async () => {
    const out = await run({ chapters: true }, { work }).result
    expect(readFileSync(out.chapters!, 'utf8')).toBe(toFfmetadataChapters([{ content: '开头', from: 0, to: 40 }]))
  })

  it('仅音频或没有章节时不写', async () => {
    expect((await run({ chapters: true, output: 'audio' }, { work }).result).chapters).toBeUndefined()
    expect((await run({ chapters: true }).result).chapters).toBeUndefined()
    expect(existsSync(join(tmp, 'chapters.txt'))).toBe(false)
  })
})

describe('弹幕', () => {
  const windows: DyDanmaku[][] = [
    [
      { danmaku_id: '2', text: '第二条', offset_time: 31_000 },
      { danmaku_id: '1', text: '第一条', offset_time: 1000 },
      { text: '没有编号' },
      { danmaku_id: '3', text: '' }
    ],
    [
      { danmaku_id: '2', text: '第二条', offset_time: 31_000 },
      { text: '没有编号' },
      { text: '第三条', offset_time: 35_000 }
    ]
  ]
  const danmaku = async (start: number): Promise<DyDanmaku[]> => windows[start / 32_000]
  const entry = (time: number, text: string) => ({ time, mode: 1, size: 25, color: 0xffffff, text })
  const LIST = [entry(0, '没有编号'), entry(1, '第一条'), entry(31, '第二条'), entry(35, '第三条')]

  it('按时间窗口取全，去重排序后写成 ASS', async () => {
    const r = run({ danmaku: true, danmakuFormat: 'ass' }, { danmaku })
    const out = await r.result
    expect(r.danmaku.mock.calls).toEqual([
      [0, 40_000],
      [32_000, 40_000]
    ])
    expect(readFileSync(out.danmakuAss!, 'utf8')).toBe(toAss(LIST, SETTINGS.danmaku))
    expect(out.danmakuXml).toBeUndefined()
  })

  it('只要 XML', async () => {
    const out = await run({ danmaku: true, danmakuFormat: 'xml' }, { danmaku }).result
    expect(readFileSync(out.danmakuXml!, 'utf8')).toBe(danmakuXml(LIST))
    expect(out.danmakuAss).toBeUndefined()
  })

  it('两种都要；竖屏视频用竖屏画布', async () => {
    const work: DyAweme = { ...WORK, video: { duration: 40_000, width: 1080, height: 1920 } }
    const out = await run({ danmaku: true, danmakuFormat: 'both' }, { work, danmaku }).result
    expect(readFileSync(out.danmakuAss!, 'utf8')).toBe(toAss(LIST, SETTINGS.danmaku, { width: 1080, height: 1920 }))
    expect(out.danmakuXml).toBeDefined()
  })

  it('时长取作品上的；都没有时只取一个窗口', async () => {
    const outer = run({ danmaku: true }, { work: { aweme_id: '1', duration: 33_000 } })
    await outer.result
    expect(outer.danmaku).toHaveBeenCalledTimes(2)
    const none = run({ danmaku: true }, { work: { aweme_id: '1' } })
    await none.result
    expect(none.danmaku.mock.calls).toEqual([[0, 0]])
  })

  it('长视频最多取 60 个窗口', async () => {
    const r = run({ danmaku: true }, { work: { aweme_id: '1', duration: 10_000_000 } })
    await r.result
    expect(r.danmaku).toHaveBeenCalledTimes(60)
  })

  it('取消后不再继续取', async () => {
    const controller = new AbortController()
    const r = run(
      { danmaku: true },
      {
        signal: controller.signal,
        danmaku: async () => {
          controller.abort()
          return []
        }
      }
    )
    await r.result
    expect(r.danmaku).toHaveBeenCalledTimes(1)
  })

  it('仅音频时不取弹幕', async () => {
    const r = run({ danmaku: true, output: 'audio' })
    await r.result
    expect(r.danmaku).not.toHaveBeenCalled()
  })

  it('取弹幕失败只记备注', async () => {
    const out = await run(
      { danmaku: true },
      {
        danmaku: async () => {
          throw new Error('被限流')
        }
      }
    ).result
    expect(out.notes).toEqual([t('download.danmakuFailed', { error: '被限流' })])
    expect(out.danmakuAss).toBeUndefined()
  })
})

describe('sniffName', () => {
  const head = (text: string, bytes: number[] = []) => Buffer.concat([Buffer.from(bytes), Buffer.from(text, 'latin1')])

  it.each([
    ['music.mp3', head('\0\0\0 ftypM4A '), 'music.m4a'],
    ['01.mp4', head('\0\0\0 ftypisom'), '01.mp4'],
    ['01.webp', head('\0\0\0 ftypheic'), '01.heic'],
    ['music.m4a', head('ID3\u0004'), 'music.mp3'],
    ['music.m4a', head('', [0xff, 0xfb, 0x90, 0]), 'music.mp3'],
    ['01.webp', head('', [0xff, 0xd8, 0xff, 0xe0]), '01.jpg'],
    ['01.jpg', head('RIFF\0\0\0\0WEBP'), '01.webp'],
    ['01.jpg', head('PNG', [0x89]), '01.png'],
    ['01.jpg', head('unknown data'), '01.jpg']
  ])('%s 按文件头改名', (name, data, expected) => {
    expect(sniffName(name, data)).toBe(expected)
  })
})

describe('没有弹幕的作品', () => {
  it('数量是 0 时不请求弹幕接口', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dy-nodm-'))
    const danmaku = vi.fn()
    const task = { item: {}, options: { ...normalizeOptions({}), danmaku: true, danmakuFormat: 'xml', chapters: false, embedCover: false } } as unknown as TaskInfo
    await prepareDyExtras(task, { aweme_id: '1', danmaku_control: { danmaku_cnt: 0 } }, dir, {} as Settings, new AbortController().signal, { danmaku })
    expect(danmaku).not.toHaveBeenCalled()
    rmSync(dir, { recursive: true, force: true })
  })
})

