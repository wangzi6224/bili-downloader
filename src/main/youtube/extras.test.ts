import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@shared/i18n'
import { normalizeOptions } from '@shared/options'
import type { DownloadOptions, TaskInfo, YtOptions } from '@shared/types'
import { subtitleTrackMeta, toFfmetadataChapters } from '../bili/subtitle'
import { AbortError } from '../download/errors'
import { fetchSponsorSegments, mergeChapters, planSubtitles, prepareYtExtras, SPONSOR_CATEGORIES, type YtExtrasDeps } from './extras'
import type { YtVideoInfo } from './types'

const sb = (category: string): string => `[SponsorBlock] ${t(`yt.sb_${category}` as 'yt.sb_sponsor')}`
const subs = (...langs: string[]): Record<string, { ext: string; name?: string }[]> =>
  Object.fromEntries(langs.map((l) => [l, [{ ext: 'vtt', name: `name-${l}` }]]))
const yt = (over: Partial<Pick<YtOptions, 'subtitleLangs' | 'autoSubs'>> = {}) => ({ subtitleLangs: [], autoSubs: false, ...over })

describe('planSubtitles', () => {
  it('选了语言时按选的取人工字幕，前缀相同的也算，去重', () => {
    const info = { subtitles: subs('en-US', 'ja', 'live_chat') }
    expect(planSubtitles(info, yt({ subtitleLangs: ['en', 'en-US', 'ja', 'live_chat'] }))).toEqual({ manual: ['en-US', 'ja'], auto: [] })
  })

  it('没选语言时用界面语言的人工字幕', () => {
    const info = { subtitles: subs('en', 'zh-Hant'), automatic_captions: subs('ja-orig') }
    expect(planSubtitles(info, yt(), 'zh-CN')).toEqual({ manual: ['zh-Hant'], auto: [] })
    expect(planSubtitles(info, yt(), 'en')).toEqual({ manual: ['en'], auto: [] })
    // 没有对应表的界面语言按英文
    expect(planSubtitles(info, yt(), 'xx' as 'en')).toEqual({ manual: ['en'], auto: [] })
    // 缺省用当前界面语言（测试里是简体中文）
    expect(planSubtitles(info, yt())).toEqual({ manual: ['zh-Hant'], auto: [] })
  })

  it('界面语言没有人工字幕时退回视频原语言', () => {
    // 原语言从 xx-orig 看出来
    expect(planSubtitles({ subtitles: subs('ja', 'fr'), automatic_captions: subs('fr-orig', 'en') }, yt(), 'ko')).toEqual({ manual: ['fr'], auto: [] })
    // 没有 -orig 时用 language
    expect(planSubtitles({ subtitles: subs('ja', 'de'), language: 'de' }, yt(), 'ko')).toEqual({ manual: ['de'], auto: [] })
    // 都不知道时取第一个人工字幕
    expect(planSubtitles({ subtitles: subs('ja', 'de') }, yt(), 'ko')).toEqual({ manual: ['ja'], auto: [] })
    expect(planSubtitles({ subtitles: null, automatic_captions: null }, yt(), 'ko')).toEqual({ manual: [], auto: [] })
  })

  it('原语言没有人工字幕时，开了自动字幕才用原语言的自动字幕', () => {
    const info = { subtitles: subs('ja'), automatic_captions: subs('en-orig', 'en', 'zh-Hans') }
    expect(planSubtitles(info, yt(), 'zh-CN')).toEqual({ manual: [], auto: [] })
    expect(planSubtitles(info, yt({ autoSubs: true }), 'zh-CN')).toEqual({ manual: [], auto: ['en-orig'] })
  })

  it('自动字幕只用原语言的 -orig；机器翻译的只在明确选了时用', () => {
    // 原语言 de 只有翻译版（没有 de-orig），没选语言时不用
    expect(planSubtitles({ automatic_captions: subs('de', 'en'), language: 'de' }, yt({ autoSubs: true }), 'ko')).toEqual({ manual: [], auto: [] })
    const info = { subtitles: subs('ja'), automatic_captions: subs('en-orig', 'zh-Hans', 'fr') }
    expect(planSubtitles(info, yt({ subtitleLangs: ['en', 'en-GB', 'zh-Hans', 'ja', 'ru'], autoSubs: true }))).toEqual({
      manual: ['ja'],
      auto: ['en-orig', 'zh-Hans']
    })
    // 选了但没开自动字幕：只要人工的
    expect(planSubtitles(info, yt({ subtitleLangs: ['en', 'zh-Hans', 'ja'] }))).toEqual({ manual: ['ja'], auto: [] })
  })

  it('原语言带地区时按主语言比较', () => {
    const info = { automatic_captions: subs('en-US-orig') }
    expect(planSubtitles(info, yt({ subtitleLangs: ['en'], autoSubs: true }))).toEqual({ manual: [], auto: ['en-US-orig'] })
  })
})

describe('mergeChapters', () => {
  it('没有章节、没有片段时整段视频算一章', () => {
    expect(mergeChapters([], [], 100, '标题')).toEqual([{ from: 0, to: 100, content: '标题' }])
  })

  it('没有片段时原样返回章节', () => {
    const chapters = [{ start_time: 0, end_time: 50, title: 'A' }, { start_time: 50, end_time: 100, title: 'B' }]
    expect(mergeChapters(chapters, [{ segment: [10, 10.5], category: 'sponsor' }], 100, 't')).toEqual([
      { from: 0, to: 50, content: 'A' },
      { from: 50, to: 100, content: 'B' }
    ])
  })

  it('片段成为一章，原章节在两侧截开；越界的截到视频范围内', () => {
    const chapters = [{ start_time: 0, end_time: 50, title: 'A' }, { start_time: 50, end_time: 100, title: 'B' }]
    const segments = [
      { segment: [40, 60] as [number, number], category: 'sponsor' },
      { segment: [-5, 5] as [number, number], category: 'intro' },
      { segment: [95, 120] as [number, number], category: 'outro' }
    ]
    expect(mergeChapters(chapters, segments, 100, 't')).toEqual([
      { from: 0, to: 5, content: sb('intro') },
      { from: 5, to: 40, content: 'A' },
      { from: 40, to: 60, content: sb('sponsor') },
      { from: 60, to: 95, content: 'B' },
      { from: 95, to: 100, content: sb('outro') }
    ])
  })

  it('不知道时长时不截片段的结尾（整段那一章长度为 0，不要）', () => {
    expect(mergeChapters([], [{ segment: [10, 20], category: 'selfpromo' }], 0, '标题')).toEqual([
      { from: 10, to: 20, content: sb('selfpromo') }
    ])
  })

  it('片段重叠时只留先开始的', () => {
    const segments = [
      { segment: [15, 25] as [number, number], category: 'interaction' },
      { segment: [10, 20] as [number, number], category: 'sponsor' }
    ]
    expect(mergeChapters([], segments, 100, '标题')).toEqual([
      { from: 0, to: 10, content: '标题' },
      { from: 10, to: 20, content: sb('sponsor') },
      { from: 25, to: 100, content: '标题' }
    ])
  })
  it('同时开始的片段只留短的那个', () => {
    const segments = [
      { segment: [10, 20] as [number, number], category: 'sponsor' },
      { segment: [10, 15] as [number, number], category: 'intro' }
    ]
    expect(mergeChapters([], segments, 30, '标题')).toEqual([
      { from: 0, to: 10, content: '标题' },
      { from: 10, to: 15, content: sb('intro') },
      { from: 20, to: 30, content: '标题' }
    ])
  })
})

describe('fetchSponsorSegments', () => {
  const signal = new AbortController().signal

  it('按视频 id 和全部分类请求', async () => {
    const segs = [{ segment: [1, 2], category: 'sponsor' }]
    const f = vi.fn(async () => Response.json(segs))
    expect(await fetchSponsorSegments('a&b', f as unknown as typeof fetch, signal)).toEqual(segs)
    expect(f).toHaveBeenCalledWith(
      `https://sponsor.ajay.app/api/skipSegments?videoID=a%26b&categories=${encodeURIComponent(JSON.stringify(SPONSOR_CATEGORIES))}`,
      { signal }
    )
  })

  it('404 表示没有片段，其他错误码报错', async () => {
    expect(await fetchSponsorSegments('x', (async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch, signal)).toEqual([])
    await expect(fetchSponsorSegments('x', (async () => new Response('', { status: 500 })) as unknown as typeof fetch, signal)).rejects.toThrow('HTTP 500')
  })
})

describe('prepareYtExtras', () => {
  let tmp = ''
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'yt-extras-'))
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  const JPG = Buffer.from('jpeg-data')
  const INFO: YtVideoInfo = {
    id: 'vid',
    title: '视频标题',
    duration: 100,
    subtitles: { en: [{ ext: 'vtt', name: 'English' }], ja: [{ ext: 'vtt' }] },
    automatic_captions: { 'de-orig': [{ ext: 'vtt', name: 'German (Original)' }] },
    chapters: [{ start_time: 0, end_time: 100, title: '全部' }]
  }
  const task = (o: Partial<DownloadOptions> = {}, ytOpts?: Partial<YtOptions>): TaskInfo => ({
    id: 't1',
    title: '视频标题',
    groupTitle: '视频标题',
    item: { key: 'yt:vid', kind: 'youtube', title: '视频标题', index: 1, cid: 0, ytId: 'vid' },
    relBase: '视频标题',
    status: 'extras',
    downloaded: 0,
    total: 0,
    speed: 0,
    createdAt: 0,
    options: { ...normalizeOptions({ embedCover: false, subtitle: false, embedSubtitle: false, chapters: false, ...o }), yt: ytOpts as YtOptions }
  })
  /** 假的封面服务器：按文件名返回状态码 */
  const covers = (status: Record<string, number>): typeof fetch =>
    vi.fn(async (url: string) => {
      const name = /\/([a-z]+)\.jpg$/.exec(url)?.[1] ?? ''
      const code = status[name] ?? 200
      return code === 200 ? new Response(JPG) : new Response(code === 410 ? null : 'nope', { status: code })
    }) as unknown as typeof fetch
  const deps = (over: Partial<YtExtrasDeps> = {}): YtExtrasDeps => ({
    exec: vi.fn(async () => undefined),
    fetch: covers({}),
    signal: new AbortController().signal,
    ...over
  })

  it('什么都不要时什么都不做；没传 fetch 也行', async () => {
    const d = deps({ fetch: undefined })
    expect(await prepareYtExtras(task(), tmp, INFO, 'info.json', d)).toEqual({ subtitles: [], notes: [] })
    expect(d.exec).not.toHaveBeenCalled()
  })

  it('封面优先 maxresdefault', async () => {
    const d = deps()
    const out = await prepareYtExtras(task({ cover: true }), tmp, INFO, 'info.json', d)
    expect(out.cover).toBe(join(tmp, 'cover.jpg'))
    expect(readFileSync(out.cover!)).toEqual(JPG)
    expect(vi.mocked(d.fetch!).mock.calls.map((c) => c[0])).toEqual(['https://i.ytimg.com/vi/vid/maxresdefault.jpg'])
  })

  it('没有 maxres 时用 hqdefault（要嵌入或写 NFO 时也取封面）', async () => {
    const d = deps({ fetch: covers({ maxresdefault: 404 }) })
    const out = await prepareYtExtras(task({ embedCover: true }), tmp, INFO, 'info.json', d)
    expect(out.cover).toBe(join(tmp, 'cover.jpg'))
    expect(vi.mocked(d.fetch!).mock.calls.map((c) => c[0])).toEqual([
      'https://i.ytimg.com/vi/vid/maxresdefault.jpg',
      'https://i.ytimg.com/vi/vid/hqdefault.jpg'
    ])
    const nfo = await prepareYtExtras(task({ nfo: true }), tmp, INFO, 'info.json', deps({ fetch: covers({ maxresdefault: 410 }) }))
    expect(nfo.cover).toBe(join(tmp, 'cover.jpg'))
  })

  it('封面都取不到时记备注', async () => {
    const out = await prepareYtExtras(task({ cover: true }), tmp, INFO, 'info.json', deps({ fetch: covers({ maxresdefault: 404, hqdefault: 410 }) }))
    expect(out.cover).toBeUndefined()
    expect(out.notes).toEqual([t('download.coverFailed', { error: 'HTTP 410' })])
    const thrown = await prepareYtExtras(task({ cover: true }), tmp, INFO, 'info.json', deps({ fetch: vi.fn(async () => Promise.reject('断网')) as unknown as typeof fetch }))
    expect(thrown.notes).toEqual([t('download.coverFailed', { error: '断网' })])
  })

  it('取封面时被中止抛 AbortError', async () => {
    const ac = new AbortController()
    const f = vi.fn(async () => {
      ac.abort()
      throw new Error('aborted')
    }) as unknown as typeof fetch
    await expect(prepareYtExtras(task({ cover: true }), tmp, INFO, 'info.json', deps({ fetch: f, signal: ac.signal }))).rejects.toBeInstanceOf(AbortError)
  })

  it('没有可下的字幕时记备注', async () => {
    const d = deps()
    const out = await prepareYtExtras(task({ subtitle: true }), tmp, { id: 'vid', title: 'x' }, 'info.json', d)
    expect(out.notes).toEqual([t('yt.noSubtitles')])
    expect(d.exec).not.toHaveBeenCalled()
  })

  it('人工和自动字幕一起下，读回 sub.<语言>.srt，缺的记备注', async () => {
    const d = deps({
      exec: vi.fn(async () => {
        writeFileSync(join(tmp, 'sub.en.srt'), '1')
        writeFileSync(join(tmp, 'sub.de-orig.srt'), '1')
      })
    })
    const out = await prepareYtExtras(task({ embedSubtitle: true }, { subtitleLangs: ['en', 'ja', 'de'], autoSubs: true }), tmp, INFO, '/x/info.json', d)
    expect(d.exec).toHaveBeenCalledWith([
      '--load-info-json', '/x/info.json',
      '--skip-download',
      '--ignore-errors',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', 'en,ja,de-orig',
      '--convert-subs', 'srt',
      '-P', tmp,
      '-o', 'sub.%(ext)s'
    ], d.signal)
    expect(out.subtitles).toEqual([
      { path: join(tmp, 'sub.en.srt'), lan: 'en', ...subtitleTrackMeta({ lan: 'en', lan_doc: 'English' }) },
      { path: join(tmp, 'sub.de-orig.srt'), lan: 'de', ...subtitleTrackMeta({ lan: 'de', lan_doc: t('yt.autoSubTitle', { name: 'German (Original)' }) }) }
    ])
    expect(out.notes).toEqual([t('yt.subtitleMissing', { langs: 'ja' })])
  })

  it('只有人工字幕时不加 --write-auto-subs，没名字的用语言代码；只有自动字幕时不加 --write-subs', async () => {
    const d = deps({ exec: vi.fn(async () => writeFileSync(join(tmp, 'sub.ja.srt'), '1')) })
    const out = await prepareYtExtras(task({ subtitle: true }, { subtitleLangs: ['ja'] }), tmp, INFO, 'i.json', d)
    const args = vi.mocked(d.exec).mock.calls[0][0]
    expect(args).toContain('--write-subs')
    expect(args).not.toContain('--write-auto-subs')
    expect(out.subtitles).toEqual([{ path: join(tmp, 'sub.ja.srt'), lan: 'ja', ...subtitleTrackMeta({ lan: 'ja', lan_doc: 'ja' }) }])
    expect(out.notes).toEqual([])

    const d2 = deps()
    await prepareYtExtras(task({ subtitle: true }, { subtitleLangs: ['de'], autoSubs: true }), tmp, INFO, 'i.json', d2)
    const args2 = vi.mocked(d2.exec).mock.calls[0][0]
    expect(args2).not.toContain('--write-subs')
    expect(args2).toContain('--write-auto-subs')
  })

  it('字幕下载失败记备注，没读到的也记', async () => {
    const d = deps({ exec: vi.fn(async () => Promise.reject(new Error('HTTP Error 429'))) })
    const out = await prepareYtExtras(task({ subtitle: true }, { subtitleLangs: ['en'] }), tmp, INFO, 'i.json', d)
    expect(out.subtitles).toEqual([])
    expect(out.notes).toEqual([t('download.subtitleFailed', { error: 'HTTP Error 429' }), t('yt.subtitleMissing', { langs: 'en' })])
  })

  it('下字幕时被中止抛 AbortError', async () => {
    const ac = new AbortController()
    const d = deps({
      signal: ac.signal,
      exec: vi.fn(async () => {
        ac.abort()
        throw new AbortError()
      })
    })
    await expect(prepareYtExtras(task({ subtitle: true }, { subtitleLangs: ['en'] }), tmp, INFO, 'i.json', d)).rejects.toBeInstanceOf(AbortError)
  })

  it('仅音频时不下字幕和章节', async () => {
    const d = deps()
    const out = await prepareYtExtras(task({ output: 'audio', subtitle: true, chapters: true }, { sponsorblock: 'mark' }), tmp, INFO, 'i.json', d)
    expect(out).toEqual({ subtitles: [], notes: [] })
    expect(d.exec).not.toHaveBeenCalled()
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it('有章节时写成 FFMETADATA；没有章节和片段时不写', async () => {
    const out = await prepareYtExtras(task({ chapters: true }), tmp, INFO, 'i.json', deps())
    expect(out.chapters).toBe(join(tmp, 'chapters.txt'))
    expect(readFileSync(out.chapters!, 'utf8')).toBe(toFfmetadataChapters([{ from: 0, to: 100, content: '全部' }]))

    rmSync(join(tmp, 'chapters.txt'))
    const none = await prepareYtExtras(task({ chapters: true }), tmp, { id: 'vid', title: 'x' }, 'i.json', deps())
    expect(none.chapters).toBeUndefined()
    expect(existsSync(join(tmp, 'chapters.txt'))).toBe(false)
  })

  it('SponsorBlock 片段并进章节；没有原章节时也写', async () => {
    const f = vi.fn(async () => Response.json([{ segment: [10, 20], category: 'sponsor' }])) as unknown as typeof fetch
    const out = await prepareYtExtras(task({ chapters: true }, { sponsorblock: 'mark' }), tmp, { id: 'vid', title: '标题' }, 'i.json', deps({ fetch: f }))
    expect(readFileSync(out.chapters!, 'utf8')).toBe(toFfmetadataChapters([{ from: 10, to: 20, content: sb('sponsor') }]))
    expect(out.notes).toEqual([])
  })

  it('SponsorBlock 取不到时记备注，章节照常', async () => {
    const f = vi.fn(async () => new Response('', { status: 502 })) as unknown as typeof fetch
    const out = await prepareYtExtras(task({ chapters: true }, { sponsorblock: 'mark' }), tmp, INFO, 'i.json', deps({ fetch: f }))
    expect(out.notes).toEqual([t('yt.sponsorFailed', { error: 'HTTP 502' })])
    expect(out.chapters).toBe(join(tmp, 'chapters.txt'))
  })

  it('取 SponsorBlock 时被中止抛 AbortError', async () => {
    const ac = new AbortController()
    const f = vi.fn(async () => {
      ac.abort()
      throw new Error('aborted')
    }) as unknown as typeof fetch
    await expect(prepareYtExtras(task({ chapters: true }, { sponsorblock: 'mark' }), tmp, INFO, 'i.json', deps({ fetch: f, signal: ac.signal }))).rejects.toBeInstanceOf(AbortError)
  })
})
