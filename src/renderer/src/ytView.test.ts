import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from '@shared/i18n'
import { DEFAULT_OPTIONS, DEFAULT_YT_OPTIONS } from '@shared/options'
import type { MediaGroup, MediaItem, ParseResult, QualityOption, Settings, StreamInfo, TaskInfo, TaskStatus, YtEngineStatus } from '@shared/types'
import {
  activeCounts,
  classifyYtPaste,
  currentYtAccount,
  engineLine,
  otherSite,
  parseLangList,
  recordsOfSite,
  sizeHint,
  tasksOfSite,
  ytDefaultOptions,
  ytDefaultQuality,
  ytFallbackQualities,
  ytItemMeta,
  ytPathPreview,
  type YtPreviewInput
} from './ytView'

afterEach(() => setLanguage('zh-CN'))

const item = (extra: Partial<MediaItem> = {}): MediaItem => ({ key: 'yt:a', kind: 'youtube', title: '视频', index: 1, cid: 0, ...extra })
const task = (id: string, kind: MediaItem['kind'], status: TaskStatus = 'queued'): TaskInfo =>
  ({ id, status, item: item({ kind }) }) as TaskInfo
const q = (qn: number, codecs: QualityOption['codecs'] = []): QualityOption => ({ qn, label: `${qn}p`, needVip: false, needLogin: false, codecs })

describe('按平台筛选', () => {
  it('tasksOfSite 只留当前平台的任务', () => {
    const tasks = [task('1', 'ugc'), task('2', 'youtube'), task('3', 'pgc'), task('4', 'audio')]
    expect(tasksOfSite(tasks, 'youtube').map((t) => t.id)).toEqual(['2'])
    expect(tasksOfSite(tasks, 'bili').map((t) => t.id)).toEqual(['1', '3', '4'])
  })

  it('recordsOfSite 按记录的 kind 分开', () => {
    const records = [{ kind: 'ugc' as const, n: 1 }, { kind: 'youtube' as const, n: 2 }, { kind: 'cheese' as const, n: 3 }]
    expect(recordsOfSite(records, 'youtube')).toEqual([{ kind: 'youtube', n: 2 }])
    expect(recordsOfSite(records, 'bili').map((r) => r.n)).toEqual([1, 3])
  })

  it('activeCounts 只数下载中和排队的任务，分平台计数', () => {
    const tasks = [
      task('1', 'ugc', 'downloading'),
      task('2', 'ugc', 'queued'),
      task('3', 'ugc', 'done'),
      task('4', 'youtube', 'merging'),
      task('5', 'youtube', 'paused'),
      task('6', 'youtube', 'error'),
      task('7', 'youtube', 'fetching')
    ]
    expect(activeCounts(tasks)).toEqual({ bili: 2, youtube: 2 })
    expect(activeCounts([])).toEqual({ bili: 0, youtube: 0 })
  })

  it('otherSite 返回另一个平台', () => {
    expect(otherSite('bili')).toBe('youtube')
    expect(otherSite('youtube')).toBe('bili')
  })
})

describe('classifyYtPaste', () => {
  it('多个不同的 YouTube 链接批量解析', () => {
    const text = '看这个 https://youtu.be/dQw4w9WgXcQ 还有 https://www.youtube.com/watch?v=aaaaaaaaaaa'
    expect(classifyYtPaste(text)).toEqual({ type: 'batch', inputs: ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=aaaaaaaaaaa'] })
  })

  it('整段就是一个链接（或快捷词）时直接解析', () => {
    expect(classifyYtPaste('https://youtu.be/dQw4w9WgXcQ')).toEqual({ type: 'single' })
    expect(classifyYtPaste('稍后观看')).toEqual({ type: 'single' })
  })

  it('同一个视频的两种写法去重后只剩一个，整段又不是链接时不处理', () => {
    expect(classifyYtPaste('https://youtu.be/dQw4w9WgXcQ https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ type: 'none' })
  })

  it('不是 YouTube 链接时不处理', () => {
    expect(classifyYtPaste('https://www.bilibili.com/video/BV1xx411c7mD')).toEqual({ type: 'none' })
    expect(classifyYtPaste('随便一段文字')).toEqual({ type: 'none' })
  })
})

describe('画质', () => {
  it('ytFallbackQualities 第一档是最高画质，名称随界面语言变化', () => {
    const list = ytFallbackQualities()
    expect(list.map((x) => x.qn)).toEqual([0, 2160, 1440, 1080, 720, 480, 360])
    expect(list[0].label).toBe('最高画质')
    expect(list[1].label).toBe('2160p (4K)')
    expect(list.every((x) => !x.needVip && !x.needLogin && x.codecs.length === 0)).toBe(true)
    setLanguage('en')
    expect(list[0].label).not.toBe('最高画质')
    expect(list[0].label).toBeTruthy()
  })

  it('ytDefaultQuality：没有画质时为空', () => {
    expect(ytDefaultQuality([], 1080)).toBeUndefined()
  })

  it('ytDefaultQuality：默认 0 时选“最高”那一档，没有就选第一个', () => {
    expect(ytDefaultQuality(ytFallbackQualities(), 0)?.qn).toBe(0)
    expect(ytDefaultQuality([q(2160), q(1080)], 0)?.qn).toBe(2160)
  })

  it('ytDefaultQuality：有上限时选不超过上限的最高一档，跳过“最高”', () => {
    expect(ytDefaultQuality(ytFallbackQualities(), 1080)?.qn).toBe(1080)
    expect(ytDefaultQuality([q(2160), q(1440), q(720)], 1080)?.qn).toBe(720)
  })

  it('ytDefaultQuality：都比上限高时选最低的一档', () => {
    expect(ytDefaultQuality([q(2160), q(1440)], 720)?.qn).toBe(1440)
  })

  it('ytDefaultOptions 合并默认选项、默认画质和 YouTube 专有选项', () => {
    const s = { youtube: { defaultQn: 1080, defaults: { ...DEFAULT_OPTIONS, yt: { container: 'mkv' } } } } as unknown as Settings
    expect(ytDefaultOptions(s)).toEqual({ ...DEFAULT_OPTIONS, qn: 1080, yt: { ...DEFAULT_YT_OPTIONS, container: 'mkv' } })
  })
})

describe('sizeHint', () => {
  const info = (size?: Record<number, number>): StreamInfo =>
    ({ yt: size ? { size, audios: [], hdr: false, subtitles: [], chapters: 0 } : undefined }) as StreamInfo

  it('没有流信息或不是 YouTube 时为空', () => {
    expect(sizeHint(null, 1080)).toBeUndefined()
    expect(sizeHint(info(), 1080)).toBeUndefined()
  })

  it('按不超过所选画质的最高一档估算；0 取最高', () => {
    const i = info({ 720: 10, 1080: 20, 2160: 40 })
    expect(sizeHint(i, 1080)).toBe(20)
    expect(sizeHint(i, 1440)).toBe(20)
    expect(sizeHint(i, 0)).toBe(40)
  })

  it('所选画质比所有档都低、或大小为 0 时为空', () => {
    expect(sizeHint(info({ 720: 10 }), 480)).toBeUndefined()
    expect(sizeHint(info({ 720: 0 }), 720)).toBeUndefined()
    expect(sizeHint(info({}), 0)).toBeUndefined()
  })
})

describe('engineLine', () => {
  const s = (x: Partial<YtEngineStatus>): YtEngineStatus => ({ state: 'ready', ...x })

  it('没有状态、或已就绪且没在更新时不显示', () => {
    expect(engineLine(null)).toBeNull()
    expect(engineLine(s({ state: 'ready' }))).toBeNull()
  })

  it('出错时显示错误信息，没有信息时用默认文案', () => {
    expect(engineLine(s({ state: 'error', message: '网络断了' }))).toEqual({ text: '网络断了', busy: false, error: true })
    expect(engineLine(s({ state: 'error' }))).toEqual({ text: 'YouTube 组件准备失败', busy: false, error: true })
  })

  it('还没安装时提示下载', () => {
    expect(engineLine(s({ state: 'missing' }))).toEqual({
      text: '第一次使用 YouTube 需要下载 YouTube 组件（yt-dlp，约 50 MB）',
      busy: false,
      error: false
    })
  })

  it('已就绪但在后台更新时显示更新的阶段', () => {
    expect(engineLine(s({ state: 'ready', updating: true, stage: 'verify' }))).toEqual({
      text: '正在后台更新 YouTube 组件：校验中',
      busy: true,
      error: false,
      percent: undefined
    })
  })

  it('下载中显示百分比，最多 100%', () => {
    expect(engineLine(s({ state: 'downloading', stage: 'download', done: 25, size: 100 }))).toEqual({
      text: '正在准备 YouTube 组件：下载中 25%',
      busy: true,
      error: false,
      percent: 25
    })
    expect(engineLine(s({ state: 'downloading', stage: 'download', done: 200, size: 100 }))?.percent).toBe(100)
    expect(engineLine(s({ state: 'downloading', stage: 'download', size: 100 }))?.percent).toBe(0)
  })

  it('不知道大小或不在下载阶段时不显示百分比；没有阶段按下载算', () => {
    expect(engineLine(s({ state: 'downloading', stage: 'download' }))).toMatchObject({ text: '正在准备 YouTube 组件：下载中', percent: undefined })
    expect(engineLine(s({ state: 'downloading' }))?.text).toBe('正在准备 YouTube 组件：下载中')
    expect(engineLine(s({ state: 'downloading', stage: 'extract', done: 5, size: 10 }))).toMatchObject({
      text: '正在准备 YouTube 组件：解压中',
      percent: undefined
    })
    expect(engineLine(s({ state: 'downloading', stage: 'warmup' }))?.text).toBe('正在准备 YouTube 组件：首次运行检查')
  })
})

describe('账号和条目', () => {
  const a = { id: 'a', name: '甲', addedAt: 1, status: 'ready' as const }

  it('currentYtAccount 返回当前账号，没登录或找不到时为空', () => {
    expect(currentYtAccount(null)).toBeUndefined()
    expect(currentYtAccount({ accounts: [a] })).toBeUndefined()
    expect(currentYtAccount({ current: 'a', accounts: [a] })).toBe(a)
    expect(currentYtAccount({ current: 'b', accounts: [a] })).toBeUndefined()
  })

  it('ytItemMeta 拼出作者、时长、视频数，缺的跳过', () => {
    const fmt = (sec: number): string => `${sec}秒`
    expect(ytItemMeta(item({ owner: '频道', duration: 30, pages: 5 }), fmt)).toBe('频道 · 30秒 · 5 个视频')
    expect(ytItemMeta(item({ duration: 0 }), fmt)).toBe('')
    expect(ytItemMeta(item({ owner: '频道' }), fmt)).toBe('频道')
  })

  it('parseLangList 按逗号、空格、顿号分隔，去重并去掉不合法的', () => {
    expect(parseLangList('en, zh-Hans，ja、en  ko')).toEqual(['en', 'zh-Hans', 'ja', 'ko'])
    expect(parseLangList('')).toEqual([])
    expect(parseLangList('zh_CN 中文 abcdefghijklmnopqrstu x')).toEqual(['x'])
  })
})

describe('ytPathPreview', () => {
  const naming = { single: '{title}< [{series}]>< {owner}>< {quality}>< {codec}> {type}', multi: '{series}/{index:02} {title}', pgc: '' }
  const result = (extra: Partial<ParseResult> = {}): ParseResult => ({
    kind: 'youtube',
    title: '来源',
    cover: '',
    groups: [],
    defaultSelected: [],
    meta: { owner: '来源作者' } as ParseResult['meta'],
    ...extra
  })
  const a = item({ key: 'a', title: '甲', index: 1 })
  const b = item({ key: 'b', title: '乙', index: 2 })
  const base = (extra: Partial<YtPreviewInput> = {}): YtPreviewInput => ({
    result: result(),
    groups: [{ id: 'g', title: '', items: [a, b] }],
    all: [a, b],
    selected: new Set(['a']),
    naming,
    opts: { output: 'full', yt: { container: 'mp4', audio: 'best', codecOrder: ['avc', 'vp9', 'av1'] } },
    chosen: q(1080, ['avc', 'vp9']),
    now: 0,
    ...extra
  })

  it('没选中时为空', () => {
    expect(ytPathPreview(base({ selected: new Set() }))).toBe('')
  })

  it('单个视频用单个模板，标题和来源不同时带上来源，作者退回来源的作者', () => {
    expect(ytPathPreview(base())).toBe('甲 [来源] 来源作者 1080p AVC YouTube.mp4')
  })

  it('单个视频标题和来源相同时不重复，条目自己的作者优先', () => {
    const one = item({ key: 'a', title: '来源', owner: '作者' })
    expect(ytPathPreview(base({ all: [one], groups: [{ id: 'g', title: '', items: [one] }] }))).toBe('来源 作者 1080p AVC YouTube.mp4')
  })

  it('选中多个、或选中的是播放列表（lazy）时用多个模板', () => {
    expect(ytPathPreview(base({ selected: new Set(['a', 'b']) }))).toBe('来源/01 甲.mp4')
    const list = item({ key: 'a', title: '列表', lazy: true, index: 3 })
    expect(ytPathPreview(base({ all: [list], groups: [{ id: 'g', title: '', items: [list] }] }))).toBe('来源/03 列表.mp4')
  })

  it('仅音频：Opus 存 .opus，其余 .m4a，不写画质和编码', () => {
    const audio = (pref: 'opus' | 'aac' | 'best') => base({ opts: { output: 'audio', yt: { container: 'mkv', audio: pref, codecOrder: ['avc'] } } })
    expect(ytPathPreview(audio('opus'))).toBe('甲 [来源] 来源作者 YouTube.opus')
    expect(ytPathPreview(audio('aac'))).toBe('甲 [来源] 来源作者 YouTube.m4a')
    expect(ytPathPreview(audio('best'))).toBe('甲 [来源] 来源作者 YouTube.m4a')
  })

  it('完整视频用所选容器的扩展名', () => {
    expect(ytPathPreview(base({ opts: { output: 'video', yt: { container: 'webm', audio: 'best', codecOrder: ['vp9'] } } }))).toMatch(/\.webm$/)
  })

  it('编码按优先顺序挑所选画质有的；画质没有编码信息时用第一个', () => {
    const order = { container: 'mkv' as const, audio: 'best' as const, codecOrder: ['avc' as const, 'vp9' as const, 'av1' as const] }
    expect(ytPathPreview(base({ opts: { output: 'full', yt: order }, chosen: q(2160, ['vp9', 'av1']) }))).toBe('甲 [来源] 来源作者 2160p VP9 YouTube.mkv')
    expect(ytPathPreview(base({ opts: { output: 'full', yt: order }, chosen: q(1440, []) }))).toBe('甲 [来源] 来源作者 1440p AVC YouTube.mkv')
    expect(ytPathPreview(base({ opts: { output: 'full', yt: { ...order, codecOrder: ['av1'] } }, chosen: q(720, ['avc']) }))).toBe(
      '甲 [来源] 来源作者 720p AV1 YouTube.mkv'
    )
  })

  it('最高画质（qn 为 0）或没选画质时不写画质', () => {
    expect(ytPathPreview(base({ chosen: q(0) }))).toBe('甲 [来源] 来源作者 AVC YouTube.mp4')
    expect(ytPathPreview(base({ chosen: undefined }))).toBe('甲 [来源] 来源作者 AVC YouTube.mp4')
  })

  it('批量解析时按条目所在的来源分组命名，只数同组选中的', () => {
    const c = item({ key: 'c', title: '丙', index: 1 })
    const groups: MediaGroup[] = [
      { id: 'g1', title: '', items: [a, b], source: { title: '列表一', kind: 'youtube', cover: '', meta: { owner: '一号' } as ParseResult['meta'] } },
      { id: 'g2', title: '', items: [c], source: { title: '列表二', kind: 'youtube', cover: '' } }
    ]
    const input = base({ result: result({ batch: true }), groups, all: [a, b, c] })
    expect(ytPathPreview({ ...input, selected: new Set(['a', 'c']) })).toBe('甲 [列表一] 一号 1080p AVC YouTube.mp4')
    expect(ytPathPreview({ ...input, selected: new Set(['a', 'b']) })).toBe('列表一/01 甲.mp4')
    expect(ytPathPreview({ ...input, selected: new Set(['c']) })).toBe('丙 [列表二] 1080p AVC YouTube.mp4')
  })

  it('批量解析但找不到条目所在的组时用解析结果本身', () => {
    const input = base({ result: result({ batch: true }), groups: [] })
    expect(ytPathPreview(input)).toBe('甲 [来源] 来源作者 1080p AVC YouTube.mp4')
    const noSource = base({ result: result({ batch: true }), groups: [{ id: 'g', title: '', items: [a, b] }], selected: new Set(['a', 'b']) })
    expect(ytPathPreview(noSource)).toBe('来源/01 甲.mp4')
  })
})
