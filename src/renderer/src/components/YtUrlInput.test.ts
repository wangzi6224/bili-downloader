// @vitest-environment jsdom

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParseResult, Settings, YtAccountsSnapshot, YtEngineStatus } from '@shared/types'
import { click, findButton, getButton, mount, pasteInto, pressKey, typeInto, type Mounted } from './testDom'

const api = {
  onParseProgress: vi.fn(() => () => {}),
  readClipboard: vi.fn(),
  yt: {
    parse: vi.fn(),
    parseBatch: vi.fn(),
    engine: { prepare: vi.fn(), cancel: vi.fn() }
  }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { YtUrlInput } = await import('./YtUrlInput')
const initial = useStore.getState()

const result = (title = '视频'): ParseResult => ({ kind: 'youtube', title, cover: '', groups: [], defaultSelected: [] })
const V1 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const V2 = 'https://youtu.be/aaaaaaaaaaa'
const loggedIn: YtAccountsSnapshot = { current: 'a', accounts: [{ id: 'a', name: '甲', addedAt: 1, status: 'ready' }] }

let m: Mounted
const input = (): HTMLInputElement => m.container.querySelector('input')!
const text = (): string => m.container.textContent ?? ''

async function render(): Promise<void> {
  await m.render(createElement(YtUrlInput))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState(initial, true)
  api.yt.parse.mockResolvedValue(result())
  api.yt.parseBatch.mockResolvedValue(result('批量'))
  api.yt.engine.prepare.mockResolvedValue({ state: 'ready' })
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('输入链接', () => {
  it('输入一个链接后回车，用 YouTube 接口解析', async () => {
    await render()
    expect(getButton(m.container, '解析').disabled).toBe(true)
    await typeInto(input(), V1)
    await pressKey(input(), 'Enter')
    expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(V1)
    expect(useStore.getState().ytParse).toMatchObject({ title: '视频' })
  })

  it('输入框里有多个链接时批量解析；点“解析”按钮也一样', async () => {
    await render()
    await typeInto(input(), `${V1} ${V2}`)
    await click(getButton(m.container, '解析'))
    expect(api.yt.parseBatch).toHaveBeenCalledExactlyOnceWith([V1, V2])
    expect(api.yt.parse).not.toHaveBeenCalled()
  })

  it('空白内容回车不解析；解析中按钮禁用并显示“解析中”', async () => {
    await render()
    await typeInto(input(), '   ')
    await pressKey(input(), 'Enter')
    expect(api.yt.parse).not.toHaveBeenCalled()
    await act(async () => useStore.setState({ ytParsing: true }))
    await typeInto(input(), V1)
    await pressKey(input(), 'Enter')
    expect(api.yt.parse).not.toHaveBeenCalled()
    expect(getButton(m.container, '解析中').disabled).toBe(true)
  })

  it('粘贴一段包含多个链接的文字时直接批量解析，不再插入原文', async () => {
    await render()
    const event = await pasteInto(input(), `看看这两个：${V1}，还有 ${V2}`)
    expect(event.defaultPrevented).toBe(true)
    expect(api.yt.parseBatch).toHaveBeenCalledExactlyOnceWith([V1, V2])
    expect(input().value).toBe(`${V1} ${V2}`)
  })

  it('粘贴单个链接时等输入框更新后再解析', async () => {
    vi.useFakeTimers()
    await render()
    const event = await pasteInto(input(), V1)
    expect(event.defaultPrevented).toBe(false)
    expect(api.yt.parse).not.toHaveBeenCalled()
    await act(async () => vi.runAllTimers())
    expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(V1)
  })

  it('粘贴不是 YouTube 链接的文字时不解析', async () => {
    vi.useFakeTimers()
    await render()
    await pasteInto(input(), 'https://www.bilibili.com/video/BV1xx411c7mD')
    await act(async () => vi.runAllTimers())
    expect(api.yt.parse).not.toHaveBeenCalled()
    expect(api.yt.parseBatch).not.toHaveBeenCalled()
  })

  it('输入框右侧按钮：空的时候从剪贴板粘贴并解析，有内容时清空', async () => {
    api.readClipboard.mockResolvedValue(`  ${V1}  `)
    await render()
    await click(getButton(m.container, '从剪贴板粘贴并解析'))
    expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(V1)
    expect(input().value).toBe(V1)
    await click(getButton(m.container, '清空链接'))
    expect(input().value).toBe('')
    api.readClipboard.mockResolvedValue('  ')
    await click(getButton(m.container, '从剪贴板粘贴并解析'))
    expect(api.yt.parse).toHaveBeenCalledTimes(1)
  })

  it('批量解析窗口：识别链接数量，一个时单独解析，多个时批量', async () => {
    await render()
    await click(getButton(m.container, '批量解析：一次粘贴多行链接'))
    const area = m.container.querySelector('textarea')!
    expect(text()).toContain('识别到 0 个链接')
    expect(getButton(m.container, '解析 0 个').disabled).toBe(true)
    await typeInto(area, `${V1}\n${V2}\n随便写点`)
    expect(text()).toContain('识别到 2 个链接')
    await click(getButton(m.container, '解析 2 个'))
    expect(api.yt.parseBatch).toHaveBeenCalledExactlyOnceWith([V1, V2])
    expect(m.container.querySelector('textarea')).toBeNull()

    await click(getButton(m.container, '批量解析：一次粘贴多行链接'))
    await typeInto(m.container.querySelector('textarea')!, V1)
    await click(getButton(m.container, '解析 1 个'))
    expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(V1)

    await click(getButton(m.container, '批量解析：一次粘贴多行链接'))
    await click(getButton(m.container, '取消'))
    expect(m.container.querySelector('textarea')).toBeNull()
  })

  it('批量解析时显示进度；只有一个时不显示', async () => {
    let onProgress!: (p: { done: number; total: number; title?: string }) => void
    api.onParseProgress.mockImplementation(((cb: typeof onProgress) => {
      onProgress = cb
      return () => {}
    }) as never)
    await render()
    // 不在解析时收到的进度忽略
    await act(async () => onProgress({ done: 1, total: 3 }))
    expect(useStore.getState().ytProgress).toBeNull()
    await act(async () => useStore.setState({ ytParsing: true }))
    await act(async () => onProgress({ done: 1, total: 3, title: '第二个视频' }))
    expect(text()).toContain('正在解析 1/3')
    expect(text()).toContain('第二个视频')
    await act(async () => onProgress({ done: 0, total: 1 }))
    expect(text()).not.toContain('正在解析')
  })
})

describe('剪贴板提示', () => {
  it('打开剪贴板检测时，剪贴板里有 YouTube 链接就提示，点“解析”解析', async () => {
    api.readClipboard.mockResolvedValue(V1)
    useStore.setState({ settings: { clipboardWatch: true } as Settings })
    await render()
    expect(text()).toContain('剪贴板里有 YouTube 链接')
    // 横幅里的“解析”在输入框旁的“解析”按钮后面
    const parses = [...m.container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '解析')
    expect(parses).toHaveLength(2)
    await click(parses[1])
    expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(V1)
    expect(text()).not.toContain('剪贴板里有 YouTube 链接')
  })

  it('多个链接时提示数量并批量解析；同样的内容回到前台不再提示；可以关闭', async () => {
    api.readClipboard.mockResolvedValue(`${V1}\n${V2}`)
    useStore.setState({ settings: { clipboardWatch: true } as Settings })
    await render()
    expect(text()).toContain('剪贴板里有 2 个链接')
    await click(getButton(m.container, '关闭'))
    expect(text()).not.toContain('剪贴板里有')
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(text()).not.toContain('剪贴板里有')
    api.readClipboard.mockResolvedValue(`${V2}\n${V1}`)
    await act(async () => window.dispatchEvent(new Event('focus')))
    await click(getButton(m.container, '批量解析'))
    expect(api.yt.parseBatch).toHaveBeenCalledExactlyOnceWith([V2, V1])
  })

  it('剪贴板没有 YouTube 链接或读取失败时不提示；没打开检测时不读剪贴板', async () => {
    api.readClipboard.mockResolvedValue('https://www.bilibili.com/video/BV1xx411c7mD')
    useStore.setState({ settings: { clipboardWatch: true } as Settings })
    await render()
    expect(text()).not.toContain('剪贴板里有')
    api.readClipboard.mockRejectedValue(new Error('没有权限'))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(text()).not.toContain('剪贴板里有')
    m.unmount()
    m = mount()
    api.readClipboard.mockClear()
    useStore.setState({ settings: { clipboardWatch: false } as Settings })
    await render()
    expect(api.readClipboard).not.toHaveBeenCalled()
  })
})

describe('组件状态横幅', () => {
  const engine = async (status: YtEngineStatus | null): Promise<void> => {
    await act(async () => useStore.setState({ ytEngine: status }))
  }

  it('还没安装时显示“下载组件”，点击开始准备', async () => {
    await render()
    await engine({ state: 'missing' })
    expect(text()).toContain('第一次使用 YouTube 需要下载 YouTube 组件')
    await click(getButton(m.container, '下载组件'))
    expect(api.yt.engine.prepare).toHaveBeenCalledOnce()
  })

  it('准备失败时不抛出未处理的错误', async () => {
    api.yt.engine.prepare.mockRejectedValue(new Error('网络错误'))
    await render()
    await engine({ state: 'missing' })
    await click(getButton(m.container, '下载组件'))
    expect(api.yt.engine.prepare).toHaveBeenCalledOnce()
  })

  it('下载中显示百分比和进度条，可以取消', async () => {
    await render()
    await engine({ state: 'downloading', stage: 'download', done: 40, size: 100 })
    expect(text()).toContain('正在准备 YouTube 组件：下载中 40%')
    const bar = m.container.querySelector<HTMLElement>('[style*="width: 40%"]')
    expect(bar).not.toBeNull()
    expect(findButton(m.container, '下载组件')).toBeUndefined()
    await click(getButton(m.container, '取消'))
    expect(api.yt.engine.cancel).toHaveBeenCalledOnce()
  })

  it('校验、解压等阶段和后台更新时没有取消按钮', async () => {
    await render()
    await engine({ state: 'downloading', stage: 'verify' })
    expect(text()).toContain('正在准备 YouTube 组件：校验中')
    expect(findButton(m.container, '取消')).toBeUndefined()
    await engine({ state: 'ready', updating: true, stage: 'download', done: 1, size: 2 })
    expect(text()).toContain('正在后台更新 YouTube 组件：下载中 50%')
    expect(findButton(m.container, '取消')).toBeUndefined()
  })

  it('出错时显示错误和“重试”', async () => {
    await render()
    await engine({ state: 'error', message: '下载 YouTube 组件失败：超时' })
    expect(text()).toContain('下载 YouTube 组件失败：超时')
    await click(getButton(m.container, '重试'))
    expect(api.yt.engine.prepare).toHaveBeenCalledOnce()
  })

  it('就绪或还不知道状态时不显示', async () => {
    await render()
    await engine({ state: 'ready', version: '2026.01.01' })
    expect(text()).not.toContain('YouTube 组件')
    await engine(null)
    expect(text()).not.toContain('YouTube 组件')
  })
})

describe('“我的”菜单', () => {
  it('没导入登录时点击打开导入登录窗口', async () => {
    await render()
    await click(getButton(m.container, '导入 YouTube 登录后可以快速打开稍后观看、喜欢的视频'))
    expect(useStore.getState().ytLoginOpen).toBe(true)
    expect(api.yt.parse).not.toHaveBeenCalled()
  })

  it.each([
    ['稍后观看', 'https://www.youtube.com/playlist?list=WL'],
    ['喜欢的视频', 'https://www.youtube.com/playlist?list=LL'],
    ['订阅内容', 'https://www.youtube.com/feed/subscriptions'],
    ['观看记录', 'https://www.youtube.com/feed/history']
  ])('登录后菜单里点“%s”解析对应链接', async (label, url) => {
    useStore.setState({ ytAccounts: loggedIn })
    await render()
    await click(getButton(m.container, '稍后观看、喜欢的视频、订阅内容、观看记录'))
    for (const name of ['稍后观看', '喜欢的视频', '订阅内容', '观看记录']) expect(findButton(m.container, name)).toBeDefined()
    await click(getButton(m.container, label))
    expect(api.yt.parse).toHaveBeenCalledExactlyOnceWith(url)
    expect(input().value).toBe(url)
    expect(findButton(m.container, '稍后观看')).toBeUndefined()
  })

  it('当前账号已被移除时按未登录处理', async () => {
    useStore.setState({ ytAccounts: { current: 'x', accounts: [] } })
    await render()
    expect(findButton(m.container, '导入 YouTube 登录后可以快速打开稍后观看、喜欢的视频')).toBeDefined()
  })
})

describe('错误和提示', () => {
  it('ytError、ytNotice 显示成横幅，可以分别关闭', async () => {
    useStore.setState({ ytError: '视频不可用', ytNotice: '1 个链接解析失败：需要登录' })
    await render()
    expect(text()).toContain('视频不可用')
    expect(text()).toContain('1 个链接解析失败：需要登录')
    const closes = () => [...m.container.querySelectorAll<HTMLButtonElement>('button[aria-label="关闭"]')]
    expect(closes()).toHaveLength(2)
    await click(closes()[0])
    expect(useStore.getState()).toMatchObject({ ytError: null, ytNotice: '1 个链接解析失败：需要登录' })
    await click(closes()[0])
    expect(useStore.getState().ytNotice).toBeNull()
    expect(text()).not.toContain('需要登录')
  })

  it('解析失败的错误显示在横幅里', async () => {
    api.yt.parse.mockRejectedValue(new Error('这不是 YouTube 链接'))
    await render()
    await typeInto(input(), V1)
    await pressKey(input(), 'Enter')
    expect(text()).toContain('这不是 YouTube 链接')
  })
})
