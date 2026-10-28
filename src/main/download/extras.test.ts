import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { DownloadOptions, MediaItem, Settings, TaskInfo } from '@shared/types'
import type { PreparedExtras } from './extras'

vi.mock('electron', () => ({}))
vi.mock('../bili/subtitle', async (o) => ({
  ...(await o<typeof import('../bili/subtitle')>()),
  fetchPlayerMeta: vi.fn(),
  downloadSubtitle: vi.fn()
}))
vi.mock('../bili/danmaku', async (o) => ({ ...(await o<typeof import('../bili/danmaku')>()), fetchDanmakuXml: vi.fn() }))

const { fetchPlayerMeta, downloadSubtitle } = await import('../bili/subtitle')
const { fetchDanmakuXml } = await import('../bili/danmaku')
const { AuthExpiredError, BASE_HEADERS } = await import('../bili/http')
const { sidecarFiles } = await import('./cleanup')
const { placeSidecars, prepareExtras } = await import('./extras')

const SETTINGS = { danmaku: { fontSize: 25, opacity: 0.8, duration: 8 } } as Settings
const XML = '<?xml version="1.0" encoding="UTF-8"?><i><d p="1.5,1,25,16777215,0,0,0,0">你好</d></i>'
const TRACKS = [
  { lan: 'zh-CN', lan_doc: '中文（中国）', subtitle_url: '//s/1.json' },
  { lan: 'ai-en', lan_doc: '英语', subtitle_url: '//s/2.json' },
  { lan: 'ja', lan_doc: '日语', subtitle_url: '//s/3.json' }
]

const ITEM: MediaItem = {
  key: 'ugc:BV1:1',
  kind: 'ugc',
  title: '视频',
  index: 1,
  cid: 11,
  bvid: 'BV1',
  cover: 'https://i0.hdslb.com/c.jpg',
  duration: 125,
  pubdate: 1704067200
}

// 默认什么附加内容都不要，每个用例只打开要测的
const task = (o: Partial<DownloadOptions> = {}, over: Partial<TaskInfo> = {}): TaskInfo => ({
  id: 't',
  title: '视频',
  groupTitle: '合集',
  item: ITEM,
  options: normalizeOptions({
    cover: false,
    embedCover: false,
    subtitle: false,
    embedSubtitle: false,
    danmaku: false,
    chapters: false,
    nfo: false,
    ...o
  }),
  relBase: '视频',
  status: 'merging',
  downloaded: 0,
  total: 0,
  speed: 0,
  createdAt: 0,
  ...over
})

const image = (type?: string): Response =>
  new Response(new Uint8Array([1, 2, 3]), type ? { headers: { 'content-type': type } } : undefined)

const fetchMock = vi.fn<typeof fetch>()
let root = ''
let tmp = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'extras-'))
  tmp = join(root, 'tmp')
  mkdirSync(tmp)
  fetchMock.mockReset().mockImplementation(async () => image('image/jpeg'))
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(fetchPlayerMeta).mockReset().mockResolvedValue({ tracks: [], viewPoints: [] })
  vi.mocked(downloadSubtitle).mockReset()
  vi.mocked(fetchDanmakuXml).mockReset().mockResolvedValue(XML)
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(root, { recursive: true, force: true })
})

describe('prepareExtras', () => {
  it('什么都不要时不发请求', async () => {
    expect(await prepareExtras(task(), tmp, SETTINGS)).toEqual({ subtitles: [], notes: [] })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fetchPlayerMeta).not.toHaveBeenCalled()
    expect(fetchDanmakuXml).not.toHaveBeenCalled()
  })

  it.each<Partial<DownloadOptions>>([{ cover: true }, { embedCover: true }, { nfo: true }])('选了 %o 时下载封面', async (o) => {
    const r = await prepareExtras(task(o), tmp, SETTINGS)
    expect(r.cover).toBe(join(tmp, 'cover.jpg'))
    expect([...readFileSync(r.cover!)]).toEqual([1, 2, 3])
    expect(fetchMock).toHaveBeenCalledWith('https://i0.hdslb.com/c.jpg', { headers: BASE_HEADERS })
  })

  it('没有封面地址时不下载', async () => {
    const r = await prepareExtras(task({ cover: true }, { item: { ...ITEM, cover: undefined } }), tmp, SETTINGS)
    expect(r.cover).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('按 content-type 或地址后缀判断 png / jpg', async () => {
    const coverOf = async (url: string, type?: string): Promise<string | undefined> => {
      fetchMock.mockResolvedValueOnce(image(type))
      return (await prepareExtras(task({ cover: true }, { item: { ...ITEM, cover: url } }), tmp, SETTINGS)).cover
    }
    expect(await coverOf('https://x/c.jpg', 'image/png')).toBe(join(tmp, 'cover.png'))
    expect(await coverOf('https://x/c.PNG', 'image/jpeg')).toBe(join(tmp, 'cover.png'))
    expect(await coverOf('https://x/c.png')).toBe(join(tmp, 'cover.png'))
    expect(await coverOf('https://x/c.webp')).toBe(join(tmp, 'cover.jpg'))
  })

  it('// 和 http: 开头的地址统一改成 https', async () => {
    await prepareExtras(task({ cover: true }, { item: { ...ITEM, cover: '//i0.hdslb.com/a.jpg' } }), tmp, SETTINGS)
    await prepareExtras(task({ cover: true }, { item: { ...ITEM, cover: 'http://i0.hdslb.com/b.jpg' } }), tmp, SETTINGS)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['https://i0.hdslb.com/a.jpg', 'https://i0.hdslb.com/b.jpg'])
  })

  it('封面下载失败只记提示', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
    const r = await prepareExtras(task({ cover: true }), tmp, SETTINGS)
    expect(r).toEqual({ subtitles: [], notes: ['封面下载失败：HTTP 404'] })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await prepareExtras(task({ cover: true }), tmp, SETTINGS)).notes).toEqual(['封面下载失败：fetch failed'])
  })

  it('下载字幕和章节，播放器信息只取一次', async () => {
    vi.mocked(fetchPlayerMeta).mockResolvedValue({ tracks: TRACKS, viewPoints: [{ from: 0, to: 10, content: '开头' }] })
    // 日语字幕内容为空，跳过
    vi.mocked(downloadSubtitle).mockImplementation(async (t) => (t.lan === 'ja' ? undefined : `srt ${t.lan}`))
    const r = await prepareExtras(task({ subtitle: true, embedSubtitle: true, chapters: true }), tmp, SETTINGS)
    expect(fetchPlayerMeta).toHaveBeenCalledTimes(1)
    expect(fetchPlayerMeta).toHaveBeenCalledWith(ITEM)
    expect(r.subtitles).toEqual([
      { path: join(tmp, 'sub.zh-CN.srt'), lan: 'zh-CN', language: 'chi', title: '中文（中国）' },
      { path: join(tmp, 'sub.ai-en.srt'), lan: 'ai-en', language: 'eng', title: '英语（AI 生成）' }
    ])
    expect(readFileSync(join(tmp, 'sub.zh-CN.srt'), 'utf8')).toBe('srt zh-CN')
    expect(r.chapters).toBe(join(tmp, 'chapters.txt'))
    expect(readFileSync(r.chapters!, 'utf8')).toContain('START=0\nEND=10000\ntitle=开头')
    expect(r.notes).toEqual([])
  })

  it('没有字幕时给出提示，没有分段时不写章节', async () => {
    const r = await prepareExtras(task({ embedSubtitle: true, chapters: true }), tmp, SETTINGS)
    expect(r).toEqual({ subtitles: [], notes: ['没有 CC 字幕'] })
    expect(readdirSync(tmp)).toEqual([])
  })

  it('只要章节时不提示没有字幕，也不下载字幕', async () => {
    vi.mocked(fetchPlayerMeta).mockResolvedValue({ tracks: TRACKS, viewPoints: [{ from: 0, to: 10, content: '开头' }] })
    const r = await prepareExtras(task({ chapters: true }), tmp, SETTINGS)
    expect(r.notes).toEqual([])
    expect(r.subtitles).toEqual([])
    expect(r.chapters).toBe(join(tmp, 'chapters.txt'))
    expect(downloadSubtitle).not.toHaveBeenCalled()
  })

  it.each<[string, Partial<DownloadOptions>, Partial<MediaItem>]>([
    ['只要音频', { output: 'audio' }, {}],
    ['音频区', {}, { kind: 'audio' }]
  ])('%s：跳过字幕、章节和弹幕，封面照下', async (_, o, kind) => {
    const all = { cover: true, subtitle: true, embedSubtitle: true, chapters: true, danmaku: true, ...o }
    const r = await prepareExtras(task(all, { item: { ...ITEM, ...kind } }), tmp, SETTINGS)
    expect(r.cover).toBe(join(tmp, 'cover.jpg'))
    expect(r.notes).toEqual([])
    expect(fetchPlayerMeta).not.toHaveBeenCalled()
    expect(fetchDanmakuXml).not.toHaveBeenCalled()
  })

  it('登录过期重新抛出，其他错误转成提示', async () => {
    vi.mocked(fetchPlayerMeta).mockRejectedValueOnce(new AuthExpiredError())
    await expect(prepareExtras(task({ subtitle: true }), tmp, SETTINGS)).rejects.toBeInstanceOf(AuthExpiredError)

    vi.mocked(fetchPlayerMeta).mockRejectedValueOnce(new Error('请求被风控'))
    expect((await prepareExtras(task({ chapters: true }), tmp, SETTINGS)).notes).toEqual(['字幕/章节获取失败：请求被风控'])

    vi.mocked(fetchPlayerMeta).mockResolvedValueOnce({ tracks: TRACKS, viewPoints: [] })
    vi.mocked(downloadSubtitle).mockRejectedValueOnce('超时')
    expect((await prepareExtras(task({ subtitle: true }), tmp, SETTINGS)).notes).toEqual(['字幕/章节获取失败：超时'])
  })

  it.each([
    ['ass', ['danmaku.ass']],
    ['xml', ['danmaku.xml']],
    ['both', ['danmaku.ass', 'danmaku.xml']]
  ] as const)('弹幕格式 %s', async (format, files) => {
    const r = await prepareExtras(task({ danmaku: true, danmakuFormat: format }), tmp, SETTINGS)
    expect(fetchDanmakuXml).toHaveBeenCalledWith(11)
    expect(readdirSync(tmp).sort()).toEqual(files)
    expect(r.danmakuAss).toBe(format === 'xml' ? undefined : join(tmp, 'danmaku.ass'))
    expect(r.danmakuXml).toBe(format === 'ass' ? undefined : join(tmp, 'danmaku.xml'))
    if (r.danmakuAss) expect(readFileSync(r.danmakuAss, 'utf8')).toMatch(/Dialogue: .*你好/)
    if (r.danmakuXml) expect(readFileSync(r.danmakuXml, 'utf8')).toBe(XML)
  })

  it('弹幕下载失败只记提示', async () => {
    vi.mocked(fetchDanmakuXml).mockRejectedValueOnce(new Error('弹幕下载失败（HTTP 412）'))
    const r = await prepareExtras(task({ danmaku: true }), tmp, SETTINGS)
    expect(r).toEqual({ subtitles: [], notes: ['弹幕下载失败：弹幕下载失败（HTTP 412）'] })
  })
})

describe('placeSidecars', () => {
  let out = ''
  let outBase = ''

  beforeEach(() => {
    out = join(root, 'out')
    outBase = join(out, '视频')
    mkdirSync(out)
  })

  /** 临时目录里准备好封面、字幕、弹幕 */
  const prepared = (over: Partial<PreparedExtras> = {}): PreparedExtras => {
    const files = { cover: 'cover.jpg', sub: 'sub.zh.srt', ass: 'danmaku.ass', xml: 'danmaku.xml' }
    for (const f of Object.values(files)) writeFileSync(join(tmp, f), f)
    return {
      cover: join(tmp, files.cover),
      subtitles: [{ path: join(tmp, files.sub), lan: 'zh', language: 'chi', title: '中文' }],
      danmakuAss: join(tmp, files.ass),
      danmakuXml: join(tmp, files.xml),
      notes: [],
      ...over
    }
  }
  const placed = (): string[] => readdirSync(out).sort()

  it('嵌入成功时只放弹幕', async () => {
    const notes = await placeSidecars(task({ embedCover: true, embedSubtitle: true, chapters: true }), prepared(), outBase, true)
    expect(notes).toEqual([])
    expect(placed()).toEqual(['视频.danmaku.ass', '视频.danmaku.xml'])
    expect(readFileSync(`${outBase}.danmaku.ass`, 'utf8')).toBe('danmaku.ass')
  })

  it('选了另存时复制封面和字幕', async () => {
    const p = prepared({ danmakuAss: undefined, danmakuXml: undefined })
    await placeSidecars(task({ cover: true, subtitle: true }), p, outBase, true)
    expect(placed()).toEqual(['视频.jpg', '视频.zh.srt'])
  })

  it('嵌入失败时改为单独保存并提示', async () => {
    const p = prepared({ danmakuAss: undefined, danmakuXml: undefined })
    const notes = await placeSidecars(task({ embedCover: true, embedSubtitle: true }), p, outBase, false)
    expect(notes).toEqual(['封面/字幕/章节写入视频失败，已改为单独保存'])
    expect(placed()).toEqual(['视频.jpg', '视频.zh.srt'])
  })

  it('只有章节嵌入失败时也提示，但没有文件可放', async () => {
    const notes = await placeSidecars(task({ chapters: true }), { subtitles: [], notes: [] }, outBase, false)
    expect(notes).toEqual(['封面/字幕/章节写入视频失败，已改为单独保存'])
    expect(placed()).toEqual([])
  })

  it('复制失败时记提示，不影响其他文件', async () => {
    const p = prepared({ cover: join(tmp, '不存在.jpg') })
    const notes = await placeSidecars(task({ cover: true }), p, outBase, true)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/^封面保存失败：ENOENT/)
    expect(placed()).toEqual(['视频.danmaku.ass', '视频.danmaku.xml'])
  })

  it('剧集 NFO：每集一份，tvshow.nfo 和 poster 只写一次', async () => {
    fetchMock.mockImplementation(async () => image('image/png'))
    const t = task({ nfo: true }, { series: true, groupTitle: '番剧', seriesCover: '//i0.hdslb.com/s.png', meta: { desc: '剧情' } })
    const p: PreparedExtras = { subtitles: [], notes: [] }
    expect(await placeSidecars(t, p, outBase, true)).toEqual([])
    expect(placed()).toEqual(['poster.png', 'tvshow.nfo', '视频.nfo'])
    expect(readFileSync(`${outBase}.nfo`, 'utf8')).toContain('<showtitle>番剧</showtitle>')
    expect(readFileSync(join(out, 'tvshow.nfo'), 'utf8')).toContain('<plot>剧情</plot>')
    expect(fetchMock).toHaveBeenCalledWith('https://i0.hdslb.com/s.png', { headers: BASE_HEADERS })

    writeFileSync(join(out, 'tvshow.nfo'), '用户改过')
    await placeSidecars(t, p, join(out, '视频2'), true)
    expect(placed()).toEqual(['poster.png', 'tvshow.nfo', '视频.nfo', '视频2.nfo'])
    expect(readFileSync(join(out, 'tvshow.nfo'), 'utf8')).toBe('用户改过')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('剧集已有 poster.jpg 或没有总封面时不下载海报', async () => {
    writeFileSync(join(out, 'poster.jpg'), '')
    const p: PreparedExtras = { subtitles: [], notes: [] }
    await placeSidecars(task({ nfo: true }, { series: true, seriesCover: 'https://x/s.jpg' }), p, outBase, true)
    await placeSidecars(task({ nfo: true }, { series: true }), p, join(root, '视频'), true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('电影 NFO：没选另存封面时把封面存成 -poster', async () => {
    const p = prepared({ subtitles: [], danmakuAss: undefined, danmakuXml: undefined })
    await placeSidecars(task({ nfo: true, embedCover: true }), p, outBase, true)
    expect(placed()).toEqual(['视频-poster.jpg', '视频.nfo'])
    expect(readFileSync(`${outBase}.nfo`, 'utf8')).toContain('<movie>')
  })

  it('电影 NFO：已选另存封面时不重复存 -poster', async () => {
    const p = prepared({ subtitles: [], danmakuAss: undefined, danmakuXml: undefined })
    await placeSidecars(task({ nfo: true, cover: true }), p, outBase, true)
    expect(placed()).toEqual(['视频.jpg', '视频.nfo'])
  })

  it('NFO 写入失败时记提示', async () => {
    const notes = await placeSidecars(task({ nfo: true }), { subtitles: [], notes: [] }, join(root, '没有这个目录', '视频'), true)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/^NFO保存失败：ENOENT/)
  })

  it('放出来的每个文件都能被 cleanup.sidecarFiles 认出来', async () => {
    const p = prepared({
      cover: join(tmp, 'cover.png'),
      subtitles: [
        { path: join(tmp, 'sub.zh.srt'), lan: 'zh-CN', language: 'chi', title: '中文' },
        { path: join(tmp, 'sub.zh.srt'), lan: 'ai-zh', language: 'chi', title: '中文（AI 生成）' }
      ]
    })
    writeFileSync(join(tmp, 'cover.png'), '')
    // 嵌入失败 + NFO：封面、-poster、字幕、弹幕、NFO 全都会放出来
    const t = task({ embedCover: true, embedSubtitle: true, nfo: true, danmaku: true, danmakuFormat: 'both' })
    await placeSidecars(t, p, outBase, false)
    writeFileSync(`${outBase}.mp4`, '')
    const files = placed().filter((n) => n !== '视频.mp4')
    expect(files).toEqual(['视频-poster.png', '视频.ai-zh.srt', '视频.danmaku.ass', '视频.danmaku.xml', '视频.nfo', '视频.png', '视频.zh-CN.srt'])
    expect(sidecarFiles(`${outBase}.mp4`).map((f) => basename(f)).sort()).toEqual(files)
  })

  it('剧集共用的 tvshow.nfo 和 poster 不算某一集的附加文件', async () => {
    fetchMock.mockImplementation(async () => image('image/jpeg'))
    const t = task({ nfo: true }, { series: true, seriesCover: 'https://x/s.jpg' })
    await placeSidecars(t, { subtitles: [], notes: [] }, outBase, true)
    expect(placed()).toEqual(['poster.jpg', 'tvshow.nfo', '视频.nfo'])
    expect(sidecarFiles(`${outBase}.mp4`).map((f) => basename(f))).toEqual(['视频.nfo'])
  })
})
