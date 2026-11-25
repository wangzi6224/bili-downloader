// @vitest-environment jsdom

import { createElement, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPTIONS, DEFAULT_YT_OPTIONS } from '@shared/options'
import type { StreamInfo, YtStreamExtras } from '@shared/types'
import { changeSelect, click, findButton, getButton, mount, typeInto, type Mounted } from './testDom'

Object.defineProperty(window, 'api', { value: {}, configurable: true })
const { YtOptionsEditor } = await import('./YtOptionsEditor')
type YtEditable = import('./YtOptionsEditor').YtEditable

const base: YtEditable = { ...DEFAULT_OPTIONS, yt: { ...DEFAULT_YT_OPTIONS } }
const streamInfo = (yt?: Partial<YtStreamExtras>, hasAudio = true): StreamInfo => ({
  qualities: [],
  audios: [],
  hasAudio,
  yt: yt ? { audios: [], hdr: true, subtitles: [], chapters: 0, size: {}, ...yt } : undefined
})

let m: Mounted
let latest: YtEditable
const onChange = vi.fn()

/** 带状态的外壳，模拟选择窗口和设置页的用法 */
function Host({ initial, info, codecs }: { initial: YtEditable; info?: StreamInfo | null; codecs?: string[] }) {
  const [value, setValue] = useState(initial)
  latest = value
  return createElement(YtOptionsEditor, {
    value,
    info,
    codecsForQuality: codecs,
    onChange: (v) => {
      onChange(v)
      setValue(v)
    }
  })
}

async function render(initial: Partial<YtEditable> = {}, info?: StreamInfo | null, codecs?: string[]): Promise<void> {
  await m.render(createElement(Host, { initial: { ...base, ...initial, yt: { ...base.yt, ...initial.yt } }, info, codecs }))
}

const checkbox = (label: string): HTMLInputElement => {
  const input = [...m.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) =>
    i.closest('label')?.textContent?.includes(label))
  if (!input) throw new Error(`未找到复选框 ${label}`)
  return input
}
const select = (): HTMLSelectElement => m.container.querySelector('select')!
const langInput = (): HTMLInputElement | null => m.container.querySelector('input[aria-label="字幕语言"]')
const text = (): string => m.container.textContent ?? ''

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  onChange.mockClear()
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.unstubAllGlobals()
})

describe('编码和 HDR', () => {
  it('按优先顺序列出编码，第一个没有上移按钮；上移后顺序改变', async () => {
    await render()
    const rows = () => [...m.container.querySelectorAll('span.font-medium')].map((s) => s.textContent)
    expect(rows()).toEqual(['AVC', 'VP9', 'AV1'])
    const raises = () => [...m.container.querySelectorAll<HTMLButtonElement>('button[aria-label="提高优先级"]')]
    expect(raises()).toHaveLength(2)
    await click(raises()[1])
    expect(latest.yt.codecOrder).toEqual(['avc', 'av1', 'vp9'])
    expect(rows()).toEqual(['AVC', 'AV1', 'VP9'])
    await click(raises()[0])
    expect(latest.yt.codecOrder).toEqual(['av1', 'avc', 'vp9'])
  })

  it('所选画质没有的编码划掉', async () => {
    await render({}, null, ['vp9', 'av1'])
    const avc = [...m.container.querySelectorAll('span.font-medium')].find((s) => s.textContent === 'AVC')!
    const vp9 = [...m.container.querySelectorAll('span.font-medium')].find((s) => s.textContent === 'VP9')!
    expect(avc.className).toContain('line-through')
    expect(vp9.className).not.toContain('line-through')
  })

  it('HDR 可以勾选；视频没有 HDR 版本时禁用，没取到流信息时可用', async () => {
    await render()
    await click(checkbox('有 HDR 版本时优先 HDR'))
    expect(latest.yt.hdr).toBe(true)
    m.unmount()
    m = mount()
    await render({}, streamInfo({ hdr: false }))
    expect(checkbox('有 HDR 版本时优先 HDR').disabled).toBe(true)
    m.unmount()
    m = mount()
    await render({}, streamInfo({ hdr: true }))
    expect(checkbox('有 HDR 版本时优先 HDR').disabled).toBe(false)
  })
})

describe('音频', () => {
  it('选择音频偏好；视频没有的音轨标出来并禁用', async () => {
    await render({}, streamInfo({ audios: [{ id: 'best', label: '', available: true }, { id: 'opus', label: '', available: false }, { id: 'aac', label: '', available: true }] }))
    const options = [...select().options]
    expect(options.map((o) => o.value)).toEqual(['best', 'opus', 'aac'])
    expect(options[1].disabled).toBe(true)
    expect(options[1].textContent).toBe('Opus（音质好，体积小）（这个视频没有）')
    expect(options[2].disabled).toBe(false)
    await changeSelect(select(), 'aac')
    expect(latest.yt.audio).toBe('aac')
  })

  it('没取到流信息时所有选项都可用', async () => {
    await render()
    expect([...select().options].every((o) => !o.disabled)).toBe(true)
  })

  it('仅视频、或视频没有音轨时禁用音频选择，没有音轨时提示', async () => {
    await render({ output: 'video' })
    expect(select().disabled).toBe(true)
    m.unmount()
    m = mount()
    await render({}, streamInfo({}, false))
    expect(select().disabled).toBe(true)
    expect(text()).toContain('这个视频没有独立音轨')
  })
})

describe('容器', () => {
  it('切换容器；WebM 写不进封面时提示', async () => {
    await render()
    expect(getButton(m.container, 'MP4').getAttribute('aria-pressed')).toBe('true')
    expect(text()).not.toContain('WebM 写不进封面')
    await click(getButton(m.container, 'WebM'))
    expect(latest.yt.container).toBe('webm')
    expect(getButton(m.container, 'WebM').getAttribute('aria-pressed')).toBe('true')
    expect(text()).toContain('WebM 写不进封面，封面会另存在视频旁边')
    await click(checkbox('封面写入文件'))
    expect(latest.embedCover).toBe(false)
    expect(text()).not.toContain('WebM 写不进封面')
  })
})

describe('字幕', () => {
  const subs = streamInfo({ subtitles: [{ lang: 'en', name: 'English', auto: false }, { lang: 'ja', name: '日本語', auto: false }] })

  it('点语言按钮选择或取消，输入框同步', async () => {
    await render({}, subs)
    await click(getButton(m.container, 'English'))
    expect(latest.yt.subtitleLangs).toEqual(['en'])
    expect(getButton(m.container, 'English').getAttribute('aria-pressed')).toBe('true')
    expect(langInput()!.value).toBe('en')
    await click(getButton(m.container, '日本語'))
    expect(latest.yt.subtitleLangs).toEqual(['en', 'ja'])
    expect(langInput()!.value).toBe('en, ja')
    await click(getButton(m.container, 'English'))
    expect(latest.yt.subtitleLangs).toEqual(['ja'])
    expect(getButton(m.container, 'English').getAttribute('aria-pressed')).toBe('false')
  })

  it('直接输入语言代码，按分隔符解析，输入框保留原文', async () => {
    await render({ yt: { ...base.yt, subtitleLangs: ['fr'] } })
    expect(langInput()!.value).toBe('fr')
    await typeInto(langInput()!, 'en，zh-Hans 中文')
    expect(latest.yt.subtitleLangs).toEqual(['en', 'zh-Hans'])
    expect(langInput()!.value).toBe('en，zh-Hans 中文')
  })

  it('自动字幕可以勾选；视频没有任何字幕时提示', async () => {
    await render({}, streamInfo({}))
    expect(text()).toContain('这个视频没有字幕')
    await click(checkbox('没有人工字幕时用自动生成的字幕'))
    expect(latest.yt.autoSubs).toBe(true)
  })

  it('有自动字幕或没取到流信息时不提示没有字幕', async () => {
    await render({}, streamInfo({ autoLang: 'en' }))
    expect(text()).not.toContain('这个视频没有字幕')
    m.unmount()
    m = mount()
    await render()
    expect(text()).not.toContain('这个视频没有字幕')
  })

  it('两种字幕都不要时隐藏语言选择；只写入视频时仍显示', async () => {
    await render({}, subs)
    await click(checkbox('字幕另存 .srt'))
    expect(latest.subtitle).toBe(false)
    expect(langInput()).toBeNull()
    expect(findButton(m.container, 'English')).toBeUndefined()
    await click(checkbox('字幕写入视频'))
    expect(latest.embedSubtitle).toBe(true)
    expect(langInput()).not.toBeNull()
  })
})

describe('附加内容和 SponsorBlock', () => {
  it('SponsorBlock 需要章节：勾选后是 mark，关掉章节后禁用且不显示勾选', async () => {
    await render()
    const sb = () => checkbox('用 SponsorBlock 标出赞助片段')
    expect(sb().disabled).toBe(false)
    await click(sb())
    expect(latest.yt.sponsorblock).toBe('mark')
    expect(sb().checked).toBe(true)
    await click(checkbox('章节（进度条分段）'))
    expect(latest.chapters).toBe(false)
    expect(sb().disabled).toBe(true)
    expect(sb().checked).toBe(false)
    await click(checkbox('章节（进度条分段）'))
    await click(sb())
    expect(latest.yt.sponsorblock).toBe('off')
  })

  it('封面另存、NFO 可以勾选，勾选 NFO 时显示说明', async () => {
    await render()
    await click(checkbox('封面另存图片'))
    expect(latest.cover).toBe(true)
    expect(text()).not.toContain('Kodi')
    await click(checkbox('NFO 元数据'))
    expect(latest.nfo).toBe(true)
    expect(text()).toContain('Kodi / Jellyfin / Emby')
  })
})

describe('仅音频', () => {
  it('选仅音频后禁用编码、HDR、容器、字幕、章节和 SponsorBlock，并说明存成什么格式', async () => {
    await render({ chapters: true, yt: { ...base.yt, sponsorblock: 'mark' } })
    expect(text()).toContain('画面和声音合成一个文件')
    await click(getButton(m.container, '仅音频'))
    expect(latest.output).toBe('audio')
    expect(text()).toContain('只要声音，存为 M4A 或 Opus')
    expect(text()).toContain('选 Opus 存为 .opus，其余存为 .m4a')
    for (const b of m.container.querySelectorAll<HTMLButtonElement>('button[aria-label="提高优先级"]')) expect(b.disabled).toBe(true)
    expect(checkbox('有 HDR 版本时优先 HDR').disabled).toBe(true)
    for (const name of ['MP4', 'MKV', 'WebM']) expect(getButton(m.container, name).disabled).toBe(true)
    for (const name of ['字幕写入视频', '字幕另存 .srt', '章节（进度条分段）', '用 SponsorBlock 标出赞助片段']) {
      expect(checkbox(name).disabled).toBe(true)
      expect(checkbox(name).checked).toBe(false)
    }
    expect(langInput()).toBeNull()
    expect(select().disabled).toBe(false)
    // 封面、NFO 仍可用
    expect(checkbox('封面写入文件').disabled).toBe(false)
  })

  it('仅视频时说明没有声音', async () => {
    await render()
    await click(getButton(m.container, '仅视频'))
    expect(latest.output).toBe('video')
    expect(text()).toContain('只保存画面，没有声音')
  })
})
