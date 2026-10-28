import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@shared/types'

type Params = Record<string, unknown>
const api = vi.hoisted(() => vi.fn<(url: string, params?: Params, opts?: { wbi?: boolean }) => Promise<unknown>>())

vi.mock('electron', () => ({}))
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), api }))

const { BASE_HEADERS } = await import('./http')
const { fetchPlayerMeta, downloadSubtitle, subtitleTrackMeta, toFfmetadataChapters } = await import('./subtitle')

const PLAYER = 'https://api.bilibili.com/x/player/wbi/v2'
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  api.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPlayerMeta', () => {
  const item = (kind: MediaItem['kind']): MediaItem => ({ key: 'k', kind, title: 't', index: 1, cid: 2, bvid: 'BV1', aid: 3, epId: 4 })

  it('ugc 用 bvid + cid，其他类型用 aid + cid + ep_id', async () => {
    api.mockResolvedValue({})
    await fetchPlayerMeta(item('ugc'))
    expect(api).toHaveBeenLastCalledWith(PLAYER, { bvid: 'BV1', cid: 2 }, { wbi: true })
    await fetchPlayerMeta(item('pgc'))
    expect(api).toHaveBeenLastCalledWith(PLAYER, { aid: 3, cid: 2, ep_id: 4 }, { wbi: true })
  })

  it('过滤没有地址的字幕和无效章节', async () => {
    api.mockResolvedValue({
      subtitle: {
        subtitles: [
          { lan: 'zh-CN', lan_doc: '中文', subtitle_url: '//s/zh.json' },
          { lan: 'en', lan_doc: 'English', subtitle_url: '' }
        ]
      },
      view_points: [
        { from: 0, to: 10, content: '开场' },
        { from: 10, to: 10, content: '长度为 0' },
        { from: 20, to: 15, content: '倒过来' },
        { from: 30, to: 40, content: '' }
      ]
    })
    expect(await fetchPlayerMeta(item('ugc'))).toEqual({
      tracks: [{ lan: 'zh-CN', lan_doc: '中文', subtitle_url: '//s/zh.json' }],
      viewPoints: [{ from: 0, to: 10, content: '开场' }]
    })
  })

  it('没有字幕和章节时返回空数组', async () => {
    api.mockResolvedValue({ subtitle: {} })
    expect(await fetchPlayerMeta(item('cheese'))).toEqual({ tracks: [], viewPoints: [] })
  })
})

describe('downloadSubtitle', () => {
  const track = (subtitle_url: string) => ({ lan: 'zh', lan_doc: '中文', subtitle_url })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  it('// 开头的地址补上 https 协议，并转成 SRT', async () => {
    fetchMock.mockResolvedValue(json({ body: [{ from: 1, to: 2.5, content: '你好 ' }] }))
    expect(await downloadSubtitle(track('//aisubtitle.hdslb.com/a.json'))).toBe('1\n00:00:01,000 --> 00:00:02,500\n你好\n')
    expect(fetchMock).toHaveBeenCalledWith('https://aisubtitle.hdslb.com/a.json', { headers: BASE_HEADERS })
  })

  it('完整地址原样请求', async () => {
    fetchMock.mockResolvedValue(json({ body: [{ from: 0, to: 1, content: 'a' }] }))
    await downloadSubtitle(track('http://x/a.json'))
    expect(fetchMock.mock.calls[0][0]).toBe('http://x/a.json')
  })

  it('HTTP 失败、body 为空或缺失时返回 undefined', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404))
    expect(await downloadSubtitle(track('//x'))).toBeUndefined()
    fetchMock.mockResolvedValueOnce(json({ body: [] }))
    expect(await downloadSubtitle(track('//x'))).toBeUndefined()
    fetchMock.mockResolvedValueOnce(json({}))
    expect(await downloadSubtitle(track('//x'))).toBeUndefined()
  })
})

describe('subtitleTrackMeta', () => {
  it.each([
    ['zh-CN', 'chi'],
    ['zh-Hant', 'chi'],
    ['ai-zh', 'chi'],
    ['en-US', 'eng'],
    ['ai-en', 'eng'],
    ['ja', 'jpn'],
    ['ai-ja', 'jpn'],
    ['ko', 'kor'],
    ['ai-ko', 'kor'],
    ['ru', 'rus'],
    ['de', 'ger'],
    ['fr', 'fre'],
    ['es', 'spa'],
    ['pt-BR', 'por'],
    ['it', 'ita'],
    ['th', 'tha'],
    ['vi', 'vie'],
    ['id', 'ind'],
    ['ar', 'ara'],
    ['he', 'heb'],
    ['iw', 'heb'],
    ['ca', 'cat'],
    ['nl', 'dut'],
    ['pl', 'pol'],
    ['tr', 'tur'],
    ['uk', 'ukr'],
    ['sv', 'swe'],
    ['hi', 'hin'],
    ['ms', 'may'],
    ['fil', 'fil'],
    ['tl', 'fil'],
    ['cs', 'cze'],
    ['el', 'gre'],
    ['fi', 'fin'],
    ['da', 'dan'],
    ['no', 'nor'],
    ['nb', 'nor'],
    ['hu', 'hun'],
    ['ro', 'rum'],
    ['ase', 'sgn'],
    ['sgn', 'sgn'],
    ['xx', 'und']
  ])('%s → %s', (lan, language) => {
    expect(subtitleTrackMeta({ lan, lan_doc: '字幕' }).language).toBe(language)
  })

  it('AI 字幕在标题里注明，已经写了 AI 或自动的不重复', () => {
    expect(subtitleTrackMeta({ lan: 'ai-zh', lan_doc: '中文' })).toEqual({ language: 'chi', title: '中文（AI 生成）' })
    expect(subtitleTrackMeta({ lan: 'ai-zh', lan_doc: '中文（自动生成）' }).title).toBe('中文（自动生成）')
    expect(subtitleTrackMeta({ lan: 'ai-en', lan_doc: 'English (AI)' }).title).toBe('English (AI)')
    expect(subtitleTrackMeta({ lan: 'zh-CN', lan_doc: '中文（中国）' }).title).toBe('中文（中国）')
  })
})

describe('toFfmetadataChapters', () => {
  it('毫秒取整，转义 = ; # \\ 和换行', () => {
    expect(
      toFfmetadataChapters([
        { from: 1.0004, to: 2.0006, content: 'a=b;c#d\\e\nf' },
        { from: 61.5, to: 3600, content: '第二章' }
      ])
    ).toBe(
      [
        ';FFMETADATA1',
        '[CHAPTER]',
        'TIMEBASE=1/1000',
        'START=1000',
        'END=2001',
        'title=a\\=b\\;c\\#d\\\\e\\\nf',
        '[CHAPTER]',
        'TIMEBASE=1/1000',
        'START=61500',
        'END=3600000',
        'title=第二章',
        ''
      ].join('\n')
    )
  })

  it('没有章节时只有文件头', () => {
    expect(toFfmetadataChapters([])).toBe(';FFMETADATA1\n')
  })
})
