import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES } from '@shared/naming'
import { DY_ORIGINAL_QN } from '@shared/options'
import type { DownloadOptions, MediaItem, ParseResult, QualityOption, Settings } from '@shared/types'
import { classifyDyPaste, currentDyAccount, dyDefaultOptions, dyDefaultQuality, dyNotice, dyPathPreview, dyQualities } from './dyView'

const q = (qn: number): QualityOption => ({ qn, label: `${qn}p`, needVip: false, needLogin: false, codecs: [] })
const ID = '7000000000000000001'

describe('classifyDyPaste', () => {
  it('多个链接批量解析，一个链接或分享口令直接解析', () => {
    expect(classifyDyPaste(`https://www.douyin.com/video/${ID} https://v.douyin.com/abc/`)).toEqual({
      type: 'batch',
      inputs: [`https://www.douyin.com/video/${ID}`, 'https://v.douyin.com/abc/']
    })
    expect(classifyDyPaste('复制打开抖音 https://v.douyin.com/abc/ 看看')).toEqual({ type: 'single' })
    expect(classifyDyPaste('https://example.com')).toEqual({ type: 'none' })
  })
})

describe('画质', () => {
  it('取到了作品画质就用它的，否则给常见几档；第一项总是最高', () => {
    expect(dyQualities([q(720)]).map((x) => x.qn)).toEqual([0, 720])
    expect(dyQualities(undefined).map((x) => x.qn)).toEqual([0, 1080, 720, 540])
    expect(dyQualities([]).map((x) => x.qn)).toEqual([0, 1080, 720, 540])
    expect(dyQualities([])[0].label).toBe('最高画质')
  })

  it('默认选不超过设置值的最高一档；原画要明确选', () => {
    const list = [q(0), q(1080), q(720), q(DY_ORIGINAL_QN)]
    expect(dyDefaultQuality(list, 0).qn).toBe(0)
    expect(dyDefaultQuality(list, 800).qn).toBe(720)
    expect(dyDefaultQuality(list, 480).qn).toBe(720)
    expect(dyDefaultQuality(list, DY_ORIGINAL_QN).qn).toBe(DY_ORIGINAL_QN)
    expect(dyDefaultQuality([q(0), q(720)], DY_ORIGINAL_QN).qn).toBe(0)
    expect(dyDefaultQuality([q(0)], 720).qn).toBe(0)
  })
})

describe('默认选项和账号', () => {
  it('用设置里记住的默认值，缺的抖音选项补齐', () => {
    const s = { douyin: { defaultQn: 720, defaults: { container: 'mkv' } } } as Settings
    expect(dyDefaultOptions(s)).toMatchObject({ qn: 720, container: 'mkv', dy: { live: true, music: true, hdr: false } })
  })

  it('当前账号', () => {
    const account = { id: 'a', name: '甲', addedAt: 1, status: 'ready' as const }
    expect(currentDyAccount({ current: 'a', accounts: [account] })).toBe(account)
    expect(currentDyAccount({ accounts: [account] })).toBeUndefined()
    expect(currentDyAccount(null)).toBeUndefined()
  })
})

describe('dyNotice', () => {
  const now = 1_000_000
  it('要验证的最要紧，其次登录失效，再次限流', () => {
    const cooling = { account: 'a', state: 'cooling' as const, until: now + 90_000 }
    const expired = { account: 'b', state: 'expired' as const }
    const verify = { account: null, state: 'verify' as const }
    expect(dyNotice([cooling, expired, verify], now)).toMatchObject({ type: 'verify', account: null })
    expect(dyNotice([cooling, expired], now)).toMatchObject({ type: 'expired' })
    expect(dyNotice([cooling], now)).toEqual({ type: 'cooling', text: '抖音暂时限制了请求，约 2 分钟后自动继续' })
  })

  it('冷却结束或没有状态时不提示', () => {
    expect(dyNotice([{ account: 'a', state: 'cooling', until: now - 1 }], now)).toBeUndefined()
    expect(dyNotice([{ account: 'a', state: 'cooling' }], now)).toBeUndefined()
    expect(dyNotice([], now)).toBeUndefined()
  })
})

describe('dyPathPreview', () => {
  const item = (n: number, over: Partial<MediaItem> = {}): MediaItem => ({ key: `dy:${n}`, kind: 'douyin', title: `作品${n}`, index: n, cid: 0, dyId: `${n}`, ...over })
  const result = (items: MediaItem[], over: Partial<ParseResult> = {}): ParseResult => ({
    kind: 'douyin', title: '合集名', cover: '', groups: [{ id: 'g', title: '合集名', items }], defaultSelected: [], ...over
  })
  const opts = { output: 'full' as DownloadOptions['output'], container: 'mp4' as const, codecOrder: ['avc', 'hevc', 'av1'] as DownloadOptions['codecOrder'] }
  const preview = (items: MediaItem[], selected: string[], extra: Partial<Parameters<typeof dyPathPreview>[0]> = {}) => {
    const r = extra.result ?? result(items)
    return dyPathPreview({ result: r, groups: r.groups, all: items, selected: new Set(selected), naming: DEFAULT_TEMPLATES, opts, now: 0, ...extra })
  }

  it('单个和多个用各自的模板，扩展名跟输出走', () => {
    const items = [item(1), item(2)]
    expect(preview(items, ['dy:1'])).toBe('合集名 - 作品1.mp4')
    expect(preview(items, ['dy:1', 'dy:2'])).toBe('合集名/01 - 作品1.mp4')
    expect(preview(items, ['dy:1'], { opts: { ...opts, output: 'audio' } })).toBe('合集名 - 作品1.m4a')
    expect(preview(items, [])).toBe('')
  })

  it('图文是一个文件夹', () => {
    expect(preview([item(1, { images: 3 })], ['dy:1'], { result: result([item(1, { images: 3 })], { title: '作品1' }) })).toBe('作品1/')
  })

  it('画质、编码和作品 id 可以用在模板里', () => {
    const naming = { single: '{title} [{quality} {codec} {id}]', multi: '{title}', pgc: '{title}' }
    const chosen = { ...q(1080), codecs: ['hevc' as const] }
    expect(preview([item(1)], ['dy:1'], { naming, chosen })).toBe('作品1 [1080p HEVC 1].mp4')
    expect(preview([item(1)], ['dy:1'], { naming, chosen: q(DY_ORIGINAL_QN) })).toBe('作品1 [ AVC 1].mp4')
  })

  it('批量解析按各组的来源命名', () => {
    const a = item(1)
    const b = item(2)
    const batch = result([a, b], {
      batch: true,
      groups: [
        { id: 'a', title: '甲', items: [a], source: { title: '甲来源', kind: 'douyin', cover: '' } },
        { id: 'b', title: '乙', items: [b] }
      ]
    })
    expect(preview([a, b], ['dy:1'], { result: batch })).toBe('甲来源 - 作品1.mp4')
    expect(preview([a, b], ['dy:2'], { result: batch })).toBe('合集名 - 作品2.mp4')
    const lost = dyPathPreview({ result: batch, groups: [], all: [a], selected: new Set(['dy:1']), naming: DEFAULT_TEMPLATES, opts, now: 0 })
    expect(lost).toBe('合集名 - 作品1.mp4')
  })
})
