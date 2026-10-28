import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParseResult, Settings } from '@shared/types'

// store 在导入时读取 window.api，必须先装好假的再动态导入；之后只改 vi.fn 的行为，不替换对象
const fakeApi = {
  settings: { set: vi.fn() },
  parse: vi.fn(),
  parseBatch: vi.fn()
}
vi.stubGlobal('window', { api: fakeApi })
const { api, parseBatch, parseLink, updateSettings, useStore } = await import('./store')

const initial = useStore.getState()

const result = (extra: Partial<ParseResult> = {}): ParseResult => ({
  kind: 'ugc',
  title: '视频',
  cover: '',
  groups: [],
  defaultSelected: [],
  ...extra
})

/** 手动控制什么时候完成的 Promise，用来检查解析过程中的状态 */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  useStore.setState(initial, true)
  vi.resetAllMocks()
})

describe('useStore', () => {
  it('api 就是导入时的 window.api', () => {
    expect(api).toBe(fakeApi)
  })

  it('初始状态', () => {
    const s = useStore.getState()
    expect(s).toMatchObject({
      auth: null,
      loginOpen: false,
      view: 'downloads',
      closeAsk: false,
      update: null,
      updateOpen: false,
      settings: null,
      tasks: [],
      parse: null,
      parsing: false,
      progress: null,
      error: null,
      notice: null
    })
  })

  it('set 只合并传入的字段', () => {
    useStore.getState().set({ view: 'settings', error: '出错了' })
    useStore.getState().set({ loginOpen: true })
    expect(useStore.getState()).toMatchObject({ view: 'settings', error: '出错了', loginOpen: true, closeAsk: false })
  })
})

describe('updateSettings', () => {
  it('成功时写入主进程返回的完整设置', async () => {
    const saved = { downloadDir: '/tmp', concurrency: 3 } as Settings
    fakeApi.settings.set.mockResolvedValue(saved)
    await updateSettings({ concurrency: 3 })
    expect(fakeApi.settings.set).toHaveBeenCalledWith({ concurrency: 3 })
    expect(useStore.getState().settings).toBe(saved)
    expect(useStore.getState().error).toBeNull()
  })

  it('失败时写入错误，设置不变', async () => {
    const before = { downloadDir: '/a' } as Settings
    useStore.setState({ settings: before })
    fakeApi.settings.set.mockRejectedValue(new Error('写入失败'))
    await updateSettings({ concurrency: 3 })
    expect(useStore.getState().error).toBe('写入失败')
    expect(useStore.getState().settings).toBe(before)
  })
})

describe.each([
  { name: 'parseLink', run: () => parseLink('BV1'), fn: fakeApi.parse, other: fakeApi.parseBatch, arg: 'BV1' },
  { name: 'parseBatch', run: () => parseBatch(['a', 'b']), fn: fakeApi.parseBatch, other: fakeApi.parse, arg: ['a', 'b'] }
])('$name', ({ run, fn, other, arg }) => {
  it('调用对应的接口', async () => {
    fn.mockResolvedValue(result())
    await run()
    expect(fn).toHaveBeenCalledWith(arg)
    expect(other).not.toHaveBeenCalled()
  })

  it('开始时进入解析状态，并清空错误、提示和进度', async () => {
    const d = deferred<ParseResult>()
    fn.mockReturnValue(d.promise)
    useStore.setState({ error: '旧错误', notice: '旧提示', progress: { done: 1, total: 2 } })
    const p = run()
    expect(useStore.getState()).toMatchObject({ parsing: true, error: null, notice: null, progress: null })
    d.resolve(result())
    await p
  })

  it('成功时写入解析结果，结束后退出解析状态、清空进度', async () => {
    const d = deferred<ParseResult>()
    fn.mockReturnValue(d.promise)
    const p = run()
    // 解析过程中主进程推送的进度
    useStore.getState().set({ progress: { done: 1, total: 3 } })
    const r = result({ title: '新结果' })
    d.resolve(r)
    await p
    expect(useStore.getState()).toMatchObject({ parse: r, parsing: false, progress: null, error: null, notice: null })
  })

  it('有失败的链接时生成提示', async () => {
    fn.mockResolvedValue(
      result({
        failures: [
          { input: 'x', error: '视频不存在' },
          { input: 'y', error: '需要登录' }
        ]
      })
    )
    await run()
    expect(useStore.getState().notice).toBe('2 个链接解析失败：视频不存在；需要登录')
  })

  it('failures 为空数组时不生成提示', async () => {
    fn.mockResolvedValue(result({ failures: [] }))
    await run()
    expect(useStore.getState().notice).toBeNull()
  })

  it('失败时写入错误，之前的解析结果保持不变', async () => {
    const before = result({ title: '之前的' })
    useStore.setState({ parse: before })
    fn.mockRejectedValue(new Error('解析失败'))
    await run()
    expect(useStore.getState()).toMatchObject({ error: '解析失败', parse: before, parsing: false, progress: null })
  })
})
