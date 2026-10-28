import { describe, expect, it } from 'vitest'
import type { NamingTemplates } from '@shared/naming'
import type { MediaGroup, MediaItem, ParseResult, QualityOption } from '@shared/types'
import {
  appendToFirst,
  bestQuality,
  CODEC_TEXT,
  downloadedMatcher,
  enqueueBatches,
  FALLBACK,
  filterGroups,
  pathPreview,
  resolveDuplicates,
  selectable,
  selectedItems,
  setMany,
  subscribable,
  toggleSelection,
  type PreviewInput
} from './selection'

const item = (key: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  key,
  kind: 'ugc',
  title: key,
  index: 1,
  cid: 1,
  ...extra
})

const group = (id: string, items: MediaItem[], extra: Partial<MediaGroup> = {}): MediaGroup => ({ id, title: id, items, ...extra })

const result = (extra: Partial<ParseResult> = {}): ParseResult => ({
  kind: 'ugc',
  title: '合集',
  cover: 'cover.jpg',
  groups: [],
  defaultSelected: [],
  ...extra
})

const q = (qn: number, extra: Partial<QualityOption> = {}): QualityOption => ({
  qn,
  label: `${qn}`,
  needVip: false,
  needLogin: false,
  codecs: ['avc'],
  ...extra
})

const keys = (list: { key: string }[]): string[] => list.map((i) => i.key)

describe('常量', () => {
  it('取不到清晰度时的兜底列表从高到低，都没有编码信息', () => {
    expect(FALLBACK.map((x) => x.qn)).toEqual([127, 80, 64, 32])
    expect(FALLBACK.every((x) => !x.needVip && x.codecs.length === 0)).toBe(true)
  })

  it('编码的显示名', () => {
    expect(CODEC_TEXT).toEqual({ avc: 'AVC', hevc: 'HEVC', av1: 'AV1' })
  })
})

describe('downloadedMatcher', () => {
  const isDownloaded = downloadedMatcher(new Set(['ugc:BV1:100', 'pgc:42']))

  it('按 key 判断', () => {
    expect(isDownloaded(item('ugc:BV1:100'))).toBe(true)
    expect(isDownloaded(item('pgc:42', { kind: 'pgc' }))).toBe(true)
    expect(isDownloaded(item('ugc:BV1:101'))).toBe(false)
  })

  it('还没展开分P的条目按 BV 号判断', () => {
    expect(isDownloaded(item('ugc:BV1', { lazy: true, bvid: 'BV1' }))).toBe(true)
    expect(isDownloaded(item('ugc:BV2', { lazy: true, bvid: 'BV2' }))).toBe(false)
  })

  it('不是懒加载或没有 BV 号的，不按 BV 号判断', () => {
    expect(isDownloaded(item('ugc:BV1:999', { bvid: 'BV1' }))).toBe(false)
    expect(isDownloaded(item('x', { lazy: true }))).toBe(false)
  })
})

describe('bestQuality', () => {
  const list = [q(120, { needVip: true }), q(116, { codecs: [] }), q(80), q(64), q(32)]

  it('取第一个不超过默认清晰度、能下载的', () => {
    expect(bestQuality(list, false, 127)?.qn).toBe(80)
    expect(bestQuality(list, false, 70)?.qn).toBe(64)
  })

  it('大会员可以选需要大会员的，但没有编码的仍跳过', () => {
    expect(bestQuality(list, true, 127)?.qn).toBe(120)
    expect(bestQuality(list, true, 116)?.qn).toBe(80)
  })

  it('都比默认清晰度高时取能下载的最后一个', () => {
    expect(bestQuality(list, false, 16)?.qn).toBe(32)
  })

  it('都下载不了时取第一个，列表为空时为 undefined', () => {
    expect(bestQuality([q(120, { needVip: true }), q(80, { codecs: [] })], false, 80)?.qn).toBe(120)
    expect(bestQuality([], false, 80)).toBeUndefined()
  })
})

describe('appendToFirst', () => {
  it('新条目接到第一组后面，已有的跳过，其它组不变', () => {
    const second = group('g2', [item('x')])
    const groups = [group('g1', [item('a'), item('b')]), second]
    const next = appendToFirst(groups, [item('b'), item('c'), item('d')])
    expect(keys(next[0].items)).toEqual(['a', 'b', 'c', 'd'])
    expect(next[1]).toBe(second)
    expect(keys(groups[0].items)).toEqual(['a', 'b'])
  })
})

describe('filterGroups', () => {
  const groups = [
    group('g1', [item('a', { title: 'Python 第一课' }), item('b', { title: '第二课', owner: '某UP主' })]),
    group('g2', [item('c', { title: '别的' })])
  ]

  it('没有筛选词时原样返回', () => {
    expect(filterGroups(groups, '  ')).toBe(groups)
  })

  it('按标题或 UP 主筛选，不区分大小写，去掉空组', () => {
    expect(filterGroups(groups, 'python').map((g) => [g.id, ...keys(g.items)])).toEqual([['g1', 'a']])
    expect(filterGroups(groups, ' 某up ').map((g) => [g.id, ...keys(g.items)])).toEqual([['g1', 'b']])
    expect(filterGroups(groups, '课').map((g) => [g.id, ...keys(g.items)])).toEqual([['g1', 'a', 'b']])
    expect(filterGroups(groups, '没有')).toEqual([])
  })
})

describe('selectable 和 selectedItems', () => {
  it('失效的条目不能选', () => {
    expect(selectable(item('a'))).toBe(true)
    expect(selectable(item('a', { unavailable: '已失效' }))).toBe(false)
  })

  it('只返回选中且能下载的，保持原顺序', () => {
    const all = [item('a'), item('b', { unavailable: '已失效' }), item('c'), item('d')]
    expect(keys(selectedItems(all, new Set(['d', 'b', 'a'])))).toEqual(['a', 'd'])
  })
})

describe('toggleSelection', () => {
  const list = [item('a'), item('b'), item('x', { unavailable: '已失效' }), item('c'), item('d')]
  const sel = (...ks: string[]): Set<string> => new Set(ks)
  const sorted = (s: Set<string>): string[] => [...s].sort()

  it('普通点击切换这一项，并记下位置', () => {
    const r = toggleSelection(sel('a'), list, list[1], null, false)
    expect(sorted(r!.selected)).toEqual(['a', 'b'])
    expect(r!.anchor).toBe(1)
    expect(sorted(toggleSelection(sel('a', 'b'), list, list[0], 1, false)!.selected)).toEqual(['b'])
  })

  it('不修改传入的集合', () => {
    const before = sel('a')
    toggleSelection(before, list, list[1], null, false)
    expect(sorted(before)).toEqual(['a'])
  })

  it('点到失效条目返回 null', () => {
    expect(toggleSelection(sel(), list, list[2], 0, true)).toBeNull()
  })

  it('Shift 点击：区间内都设成选中，跳过失效条目', () => {
    const r = toggleSelection(sel(), list, list[4], 0, true)
    expect(sorted(r!.selected)).toEqual(['a', 'b', 'c', 'd'])
    expect(r!.anchor).toBe(4)
  })

  it('Shift 点击已选中的一项：区间内都取消选中', () => {
    const r = toggleSelection(sel('a', 'b', 'c', 'd'), list, list[1], 3, true)
    expect(sorted(r!.selected)).toEqual(['a', 'd'])
  })

  it('Shift 往上选也可以', () => {
    const r = toggleSelection(sel('d'), list, list[0], 3, true)
    expect(sorted(r!.selected)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('没有上次点击的位置时，Shift 点击只切换这一项', () => {
    const r = toggleSelection(sel(), list, list[3], null, true)
    expect(sorted(r!.selected)).toEqual(['c'])
  })
})

describe('setMany', () => {
  const list = [item('a'), item('x', { unavailable: '已失效' }), item('b')]

  it('批量选中，跳过失效条目', () => {
    expect([...setMany(new Set(['c']), list, true)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('批量取消，不在列表里的保持不变', () => {
    expect([...setMany(new Set(['a', 'b', 'c']), list, false)]).toEqual(['c'])
  })
})

describe('enqueueBatches', () => {
  it('普通解析：所有条目作为一批，用解析结果的标题和封面', () => {
    const r = result({ meta: { owner: 'UP' } })
    const items = [item('a'), item('b')]
    expect(enqueueBatches(r, [], items)).toEqual([{ title: '合集', cover: 'cover.jpg', kind: 'ugc', meta: { owner: 'UP' }, items }])
  })

  it('批量解析：按来源拆分，跳过没有选中条目或没有来源信息的组', () => {
    const groups = [
      group('g1', [item('a'), item('b')], { source: { title: '来源一', kind: 'ugc', cover: 'c1' } }),
      group('g2', [item('c')], { source: { title: '来源二', kind: 'pgc', cover: 'c2', meta: { owner: 'X' } } }),
      group('g3', [item('d')], { source: { title: '来源三', kind: 'ugc', cover: 'c3' } }),
      group('g4', [item('e')])
    ]
    const batches = enqueueBatches(result({ batch: true }), groups, [item('b'), item('c'), item('e')])
    expect(batches.map((b) => [b.title, b.kind, b.cover, b.meta, keys(b.items)])).toEqual([
      ['来源一', 'ugc', 'c1', undefined, ['b']],
      ['来源二', 'pgc', 'c2', { owner: 'X' }, ['c']]
    ])
  })
})

describe('resolveDuplicates', () => {
  const items = [item('a'), item('b'), item('c')]
  const isDownloaded = (i: MediaItem): boolean => i.key === 'b'

  it('没有下载过的就直接下载', () => {
    expect(resolveDuplicates(items, () => false, 'ask')).toEqual({ enqueue: items })
  })

  it('设置为仍然下载时全部下载', () => {
    expect(resolveDuplicates(items, isDownloaded, 'download')).toEqual({ enqueue: items })
  })

  it('设置为跳过时去掉下载过的', () => {
    expect(resolveDuplicates(items, isDownloaded, 'skip')).toEqual({ enqueue: [items[0], items[2]] })
  })

  it('设置为询问时返回下载过的条目', () => {
    expect(resolveDuplicates(items, isDownloaded, 'ask')).toEqual({ ask: [items[1]] })
  })
})

describe('pathPreview', () => {
  const naming: NamingTemplates = {
    single: 'S <{series} - >{title}',
    multi: 'M {series}/{index:02} {title}',
    pgc: 'P {series}/{index:02} {title}'
  }
  const opts: PreviewInput['opts'] = { output: 'full', audio: 'best', container: 'mp4', codecOrder: ['avc', 'hevc', 'av1'] }
  const now = new Date(2030, 0, 2, 12).getTime()
  const base = (extra: Partial<PreviewInput>): PreviewInput => {
    const all = extra.all ?? extra.groups?.flatMap((g) => g.items) ?? []
    return {
      result: result(),
      groups: [group('g', all)],
      all,
      selected: new Set(),
      naming,
      opts,
      audioKind: false,
      now,
      ...extra
    }
  }
  const eps = [item('e1', { title: '第一集', index: 1 }), item('e2', { title: '第二集', index: 2 }), item('e3', { title: '第三集', index: 3 })]

  it('没有选中时为空', () => {
    expect(pathPreview(base({ all: eps }))).toBe('')
  })

  it('只选一个：用单个模板，标题和总标题不同时带上总标题', () => {
    expect(pathPreview(base({ all: eps, selected: new Set(['e2']) }))).toBe('S 合集 - 第二集.mp4')
  })

  it('只选一个且标题就是总标题时，总标题为空', () => {
    const single = [item('v', { title: '合集' })]
    expect(pathPreview(base({ all: single, selected: new Set(['v']) }))).toBe('S 合集.mp4')
  })

  it('选多个：普通视频用合集模板，以第一个选中的为例', () => {
    expect(pathPreview(base({ all: eps, selected: new Set(['e3', 'e2']) }))).toBe('M 合集/02 第二集.mp4')
  })

  it('选多个：番剧和课程用番剧模板', () => {
    expect(pathPreview(base({ result: result({ kind: 'pgc' }), all: eps, selected: new Set(['e1', 'e2']) }))).toBe('P 合集/01 第一集.mp4')
    expect(pathPreview(base({ result: result({ kind: 'cheese' }), all: eps, selected: new Set(['e1', 'e2']) }))).toBe('P 合集/01 第一集.mp4')
  })

  it('选中的失效条目不计入数量', () => {
    const all = [item('a', { title: 'A' }), item('b', { title: 'B', unavailable: '已失效' })]
    expect(pathPreview(base({ all, selected: new Set(['a', 'b']) }))).toBe('S 合集 - A.mp4')
  })

  it('批量解析：用第一个选中条目所在来源的标题，只数这个来源里选中的', () => {
    const g1 = group('g1', [item('a', { title: 'A' })], { source: { title: '来源一', kind: 'ugc', cover: '' } })
    const g2 = group('g2', [item('b', { title: 'B', index: 4 }), item('c', { title: 'C' })], {
      source: { title: '来源二', kind: 'pgc', cover: '' }
    })
    const r = result({ batch: true, title: '2 个来源' })
    expect(pathPreview(base({ result: r, groups: [g1, g2], selected: new Set(['b', 'c']) }))).toBe('P 来源二/04 B.mp4')
    expect(pathPreview(base({ result: r, groups: [g1, g2], selected: new Set(['a', 'c']) }))).toBe('S 来源一 - A.mp4')
  })

  it('批量解析但所在组没有来源信息时用解析结果的标题', () => {
    const g = group('g', [item('a', { title: 'A' })])
    expect(pathPreview(base({ result: result({ batch: true }), groups: [g], selected: new Set(['a']) }))).toBe('S 合集 - A.mp4')
  })

  it('批量解析时第一个选中的条目不在任何组里，按 0 个算', () => {
    const all = [item('a', { title: 'A' })]
    expect(pathPreview(base({ result: result({ batch: true }), groups: [], all, selected: new Set(['a']) }))).toBe('S 合集 - A.mp4')
  })

  describe('扩展名', () => {
    const one = { all: eps, selected: new Set(['e1']) }

    it('完整视频和仅视频用封装格式', () => {
      expect(pathPreview(base({ ...one, opts: { ...opts, container: 'mkv' } }))).toMatch(/\.mkv$/)
      expect(pathPreview(base({ ...one, opts: { ...opts, output: 'video' } }))).toMatch(/\.mp4$/)
    })

    it('仅音频：无损为 flac，其它为 m4a', () => {
      expect(pathPreview(base({ ...one, opts: { ...opts, output: 'audio' } }))).toMatch(/\.m4a$/)
      expect(pathPreview(base({ ...one, opts: { ...opts, output: 'audio', audio: 'flac' } }))).toMatch(/\.flac$/)
    })

    it('音频区内容不管选项都按音频算', () => {
      expect(pathPreview(base({ ...one, audioKind: true, opts: { ...opts, container: 'mkv' } }))).toMatch(/\.m4a$/)
    })
  })

  describe('画质和编码', () => {
    const tpl: NamingTemplates = { single: '{title}<_{quality}><_{codec}>', multi: '', pgc: '' }
    const one = { all: eps, selected: new Set(['e1']), naming: tpl }
    const hd = q(80, { label: '1080P 高清', codecs: ['hevc', 'av1'] })

    it('编码取优先级里第一个这个清晰度有的', () => {
      expect(pathPreview(base({ ...one, chosen: hd }))).toBe('第一集_1080P 高清_HEVC.mp4')
      expect(pathPreview(base({ ...one, chosen: hd, opts: { ...opts, codecOrder: ['av1', 'hevc', 'avc'] } }))).toBe('第一集_1080P 高清_AV1.mp4')
    })

    it('不知道清晰度的编码或者没有交集时，用优先级第一个', () => {
      expect(pathPreview(base({ ...one, chosen: q(80, { label: '1080P', codecs: [] }) }))).toBe('第一集_1080P_AVC.mp4')
      expect(pathPreview(base({ ...one }))).toBe('第一集_AVC.mp4')
      expect(pathPreview(base({ ...one, chosen: q(80, { label: 'X', codecs: ['avc'] }), opts: { ...opts, codecOrder: ['av1'] } }))).toBe(
        '第一集_X_AV1.mp4'
      )
    })

    it('仅音频时不带画质和编码', () => {
      expect(pathPreview(base({ ...one, chosen: hd, opts: { ...opts, output: 'audio' } }))).toBe('第一集.m4a')
    })
  })

  it('其它变量：UP 主、发布时间优先取条目自己的，没有时用整体元数据；类型和创建时间', () => {
    const tpl: NamingTemplates = {
      single: '{owner}_{owner_mid}_{pubdate:YYYY}_{date:YYYYMMDD}_{type}_{bvid}_{aid}_{cid}<_{ep_id}>',
      multi: '',
      pgc: ''
    }
    const r = result({ kind: 'pgc', meta: { owner: '整体', ownerMid: 1, pubdate: new Date(2020, 5, 1).getTime() / 1000 } })
    const own = item('a', { owner: '自己', ownerMid: 2, pubdate: new Date(2021, 5, 1).getTime() / 1000, bvid: 'BV9', aid: 7, cid: 8, epId: 9 })
    const bare = item('b', { cid: 3 })
    expect(pathPreview(base({ result: r, all: [own], selected: new Set(['a']), naming: tpl }))).toBe('自己_2_2021_20300102_番剧影视_BV9_7_8_9.mp4')
    expect(pathPreview(base({ result: r, all: [bare], selected: new Set(['b']), naming: tpl }))).toBe('整体_1_2020_20300102_番剧影视___3.mp4')
    const types = (['ugc', 'cheese', 'audio'] as const).map((kind) =>
      pathPreview(base({ result: result({ kind }), all: [bare], selected: new Set(['b']), naming: { ...tpl, single: '{type}' } }))
    )
    expect(types).toEqual(['视频.mp4', '课程.mp4', '音频.mp4'])
  })
})

describe('subscribable', () => {
  const paging = { source: { type: 'fav' as const, mediaId: 1 }, page: 1, total: 100, hasMore: true }

  it('没有原始链接或者是批量解析时不能订阅', () => {
    expect(subscribable(result({ kind: 'pgc' }), paging, 5)).toBe(false)
    expect(subscribable(result({ input: 'x', batch: true }), paging, 5)).toBe(false)
  })

  it('分页来源、多个条目、番剧和课程可以订阅', () => {
    expect(subscribable(result({ input: 'x' }), paging, 1)).toBe(true)
    expect(subscribable(result({ input: 'x' }), undefined, 2)).toBe(true)
    expect(subscribable(result({ input: 'x', kind: 'pgc' }), undefined, 1)).toBe(true)
    expect(subscribable(result({ input: 'x', kind: 'cheese' }), undefined, 1)).toBe(true)
  })

  it('单个普通视频不能订阅', () => {
    expect(subscribable(result({ input: 'x' }), undefined, 1)).toBe(false)
  })
})
