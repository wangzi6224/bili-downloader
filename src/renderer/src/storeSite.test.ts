// @vitest-environment jsdom
// useSite 是 hook，要在真正渲染的组件里读（服务端渲染只会读到初始状态）

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '@shared/types'

Object.defineProperty(window, 'api', { value: { settings: { set: vi.fn() } }, configurable: true })
const { switchSite, useSite, useStore } = await import('./store')
const initial = useStore.getState()

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
const renders: string[] = []
const Site = (): string => {
  const site = useSite()
  renders.push(site)
  return site
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  useStore.setState(initial, true)
  renders.length = 0
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root.render(createElement(Site)))
})

afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
})

describe('useSite', () => {
  it('还没拿到设置时是 B站', () => {
    expect(container.textContent).toBe('bili')
  })

  it('跟随设置里的 uiSite 重新渲染', async () => {
    await act(async () => useStore.setState({ settings: { uiSite: 'youtube' } as Settings }))
    expect(container.textContent).toBe('youtube')
    await act(async () => useStore.setState({ settings: { uiSite: 'bili' } as Settings }))
    expect(container.textContent).toBe('bili')
  })

  it('switchSite 本地先切换，界面立刻变成新平台', async () => {
    useStore.setState({ settings: { uiSite: 'bili' } as Settings })
    vi.mocked(window.api.settings.set).mockReturnValue(new Promise(() => {}))
    await act(async () => void switchSite('youtube'))
    expect(container.textContent).toBe('youtube')
  })

  it('设置里别的字段变化时不重新渲染', async () => {
    await act(async () => useStore.setState({ settings: { uiSite: 'youtube', concurrency: 1 } as Settings }))
    const count = renders.length
    await act(async () => useStore.setState({ settings: { uiSite: 'youtube', concurrency: 2 } as Settings }))
    expect(renders.length).toBe(count)
  })
})
