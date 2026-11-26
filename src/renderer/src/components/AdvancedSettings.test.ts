// @vitest-environment jsdom

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings, Site } from '@shared/types'
import { mount, type Mounted } from './testDom'

const api = {
  platform: 'darwin',
  net: { cdnHosts: vi.fn(), status: vi.fn(), test: vi.fn(), pingCdn: vi.fn() },
  watermark: { aiStatus: vi.fn(), onAiStatus: vi.fn(() => () => {}) },
  config: { exportTo: vi.fn(), importFrom: vi.fn() },
  settings: { set: vi.fn(), get: vi.fn() }
}
Object.defineProperty(window, 'api', { value: api, configurable: true })
const { useStore } = await import('../store')
const { AdvancedSettings } = await import('./AdvancedSettings')
const initial = useStore.getState()

const settings = (uiSite: Site): Settings => ({ uiSite, proxy: { mode: 'direct', url: '' }, cdn: '' }) as Settings

let m: Mounted
const text = (): string => m.container.textContent ?? ''

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  useStore.setState(initial, true)
  api.net.cdnHosts.mockResolvedValue([{ host: 'upos.example.com', label: '示例节点' }])
  api.net.status.mockResolvedValue({ text: '直连', error: false })
  api.watermark.aiStatus.mockResolvedValue({ state: 'missing', size: 1 })
  m = mount()
})

afterEach(() => {
  m.unmount()
  vi.unstubAllGlobals()
})

describe('网络与高级', () => {
  it('CDN 节点是 B站专属的：只在 B站主题显示，代理在各主题都有', async () => {
    useStore.setState({ settings: settings('bili') })
    await m.render(createElement(AdvancedSettings))
    expect(text()).toContain('CDN')
    expect(text()).toContain('示例节点')
    for (const site of ['youtube', 'douyin'] as const) {
      await act(async () => useStore.setState({ settings: settings(site) }))
      expect(text()).not.toContain('CDN')
      expect(text()).not.toContain('示例节点')
      expect(text()).toContain('代理')
    }
    await act(async () => useStore.setState({ settings: settings('bili') }))
    expect(text()).toContain('示例节点')
  })
})
