// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { ParseRecord, ParseResult } from '@shared/types'

const api = { history: { parses: vi.fn() }, parse: vi.fn() }
Object.defineProperty(window, 'api', { value: api, configurable: true })

const { HistoryPage } = await import('./HistoryPage')
const { useStore } = await import('../store')
const initial = useStore.getState()

afterEach(() => {
  useStore.setState(initial, true)
  vi.unstubAllGlobals()
})

it.each(['click', 'Enter'])('用 %s 打开同一链接的历史记录时，解析该行所属账号', async (action) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const record: ParseRecord = { input: 'watchlater', kind: 'ugc', title: '账号 A 的稍后再看', cover: '', count: 1, at: 1, accountMid: 1 }
  const detail: ParseResult = { kind: 'ugc', title: record.title, cover: '', groups: [], defaultSelected: [] }
  api.history.parses.mockResolvedValue([record, { ...record, title: '账号 B 的稍后再看', accountMid: 2 }])
  api.parse.mockReset().mockResolvedValue(detail)
  useStore.setState({ view: 'history', accounts: { activeMid: 2, accounts: [], legacyCount: 0 } })

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(createElement(HistoryPage)))
    const row = [...container.querySelectorAll<HTMLElement>('[role="button"]')]
      .find((element) => element.textContent?.includes(record.title))!
    await act(async () => {
      if (action === 'click') row.click()
      else row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(api.parse).toHaveBeenCalledExactlyOnceWith(record.input, 1)
    expect(useStore.getState()).toMatchObject({ parse: detail, sourceAccountMid: 1, accounts: { activeMid: 2 } })
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
