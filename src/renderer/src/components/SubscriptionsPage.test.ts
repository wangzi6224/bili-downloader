// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '@shared/i18n'
import { DEFAULT_OPTIONS } from '@shared/options'
import type { Subscription } from '@shared/types'

const api = {
  sources: { subscribeDownload: vi.fn(), listAccount: vi.fn() },
  subs: { list: vi.fn(), onUpdate: vi.fn(() => () => {}), check: vi.fn(), remove: vi.fn(), update: vi.fn() }
}

Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { SubscriptionsPage } = await import('./SubscriptionsPage')

const subscription: Subscription = {
  id: 's1', input: 'https://www.bilibili.com/bangumi/play/ss1', title: '测试番剧', kind: 'pgc',
  intervalMin: 360, enabled: true, options: { ...DEFAULT_OPTIONS, qn: 80 }, seen: [], createdAt: 1, accountMid: 1
}
const source = { type: 'subscription', id: 's1' }

let root: Root
let container: HTMLDivElement

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  setLanguage('zh-CN')
  useStore.setState({ lang: 'zh-CN', auth: { loggedIn: false }, accounts: null })
  api.subs.list.mockResolvedValue([subscription])
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(SubscriptionsPage)))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const button = (label: string): HTMLButtonElement =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label || b.getAttribute('aria-label') === label)!

async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click())
}

describe('一键下载前的确认', () => {
  it('内容多或有要跳过的先弹确认；选择只订阅以后的新内容时带上选择再调用', async () => {
    api.sources.subscribeDownload
      .mockResolvedValueOnce({ title: '测试番剧', subscribed: false, count: 0, confirm: { count: 40, vip: 2, extras: 3, subscribe: true } })
      .mockResolvedValueOnce({ title: '测试番剧', subscribed: true, count: 0 })
    await click(button('下载缺失内容'))
    expect(api.sources.subscribeDownload).toHaveBeenLastCalledWith(source)
    const text = container.textContent ?? ''
    expect(text).toContain('将下载 40 项缺失的内容。')
    expect(text).toContain('2 项是大会员专享')
    expect(text).toContain('3 项预告、花絮等非正片内容不会下载。')
    expect(button('下载 40 项')).toBeTruthy()
    await click(button('只订阅以后的新内容'))
    expect(api.sources.subscribeDownload).toHaveBeenLastCalledWith(source, 'future')
    expect(container.textContent).not.toContain('将下载 40 项')
    expect(container.textContent).toContain('已订阅「测试番剧」')
  })

  it('确认下载后显示入队数量和跳过的内容；取消时什么都不做', async () => {
    api.sources.subscribeDownload
      .mockResolvedValueOnce({ title: '测试番剧', subscribed: false, count: 0, confirm: { count: 31, vip: 0, extras: 0, subscribe: false } })
      .mockResolvedValueOnce({ title: '测试番剧', subscribed: false, count: 31, skipped: { vip: 0, extras: 2 } })
      .mockResolvedValueOnce({ title: '测试番剧', subscribed: false, count: 0, confirm: { count: 31, vip: 0, extras: 0, subscribe: false } })
    await click(button('下载缺失内容'))
    expect(button('只订阅以后的新内容')).toBeUndefined()
    await click(button('下载 31 项'))
    expect(api.sources.subscribeDownload).toHaveBeenLastCalledWith(source, 'all')
    expect(container.textContent).toContain('已加入 31 项到下载队列')
    expect(container.textContent).toContain('未下载 2 项预告、花絮等非正片内容')

    await click(button('下载缺失内容'))
    await click(button('取消'))
    expect(api.sources.subscribeDownload).toHaveBeenCalledTimes(3)
    expect(container.textContent).not.toContain('下载 31 项')
  })
})
