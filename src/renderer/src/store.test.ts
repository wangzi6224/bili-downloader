import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState, ParseResult, Settings, SourceDetails, SourceRef } from '@shared/types'
import { api, openSource, parseBatch, parseLink, reopenParseRecord, updateAccounts, updateAuth, updateSettings, useStore } from './store'

// store 在导入时读取 window.api，只在加载模块期间模拟 window。
const fakeApi = vi.hoisted(() => {
  const api = {
    settings: { set: vi.fn() },
    sources: { open: vi.fn() },
    parse: vi.fn(),
    parseBatch: vi.fn()
  }
  vi.stubGlobal('window', { api })
  return api
})
vi.unstubAllGlobals()

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

describe('打开来源', () => {
  const loggedIn = (mid: number): AuthState => ({
    loggedIn: true,
    user: { mid, uname: 'u', face: '', vipActive: false, vipLabel: '' }
  })
  const subscription: SourceRef = { type: 'subscription', id: 'legacy' }
  const account: SourceRef = { type: 'account', mid: 7, target: { type: 'pgc', seasonId: 1 } }

  it('切号再切回时丢弃第一次解析，新的解析绑定当前账号', async () => {
    updateAccounts({ activeMid: 7, accounts: [], legacyCount: 0 })
    const pending = deferred<ParseResult>()
    fakeApi.parse.mockReturnValueOnce(pending.promise)
    const oldRequest = parseLink('old')
    updateAccounts({ activeMid: 8, accounts: [], legacyCount: 0 })
    updateAccounts({ activeMid: 7, accounts: [], legacyCount: 0 })
    fakeApi.parse.mockResolvedValueOnce(result({ title: '新解析' }))
    await parseLink('new')
    pending.resolve(result({ title: '旧解析' }))
    await oldRequest
    expect(useStore.getState()).toMatchObject({ parse: { title: '新解析' }, sourceAccountMid: 7, parsing: false })
  })

  it('历史详情绑定原账号，侧栏账号刷新不关闭详情，原账号退出才关闭', async () => {
    const active = loggedIn(7)
    const owner = loggedIn(8)
    if (!active.loggedIn || !owner.loggedIn) throw new Error('测试需要两个登录账号')
    const snapshot = {
      activeMid: 7,
      accounts: [{ ...active.user, status: 'ready' as const }, { ...owner.user, status: 'ready' as const }],
      legacyCount: 0
    }
    useStore.setState({ view: 'history', auth: active, accounts: snapshot })
    const details = result({ title: '账号 8 的稍后再看' })
    fakeApi.parse.mockResolvedValue(details)
    await reopenParseRecord({ input: 'watchlater', accountMid: 8 })
    expect(fakeApi.parse).toHaveBeenCalledWith('watchlater', 8)
    expect(useStore.getState()).toMatchObject({ view: 'downloads', parse: details, sourceAccountMid: 8, auth: active })
    updateAuth(active)
    expect(useStore.getState().parse).toBe(details)
    updateAccounts({ ...snapshot, accounts: [snapshot.accounts[0], { ...owner.user, status: 'removed' }] })
    expect(useStore.getState()).toMatchObject({ parse: null, sourceAccountMid: undefined })
  })

  it('旧历史没有账号时仍用侧栏当前账号', async () => {
    updateAccounts({ activeMid: 7, accounts: [], legacyCount: 0 })
    fakeApi.parse.mockResolvedValue(result())
    await reopenParseRecord({ input: 'BV1' })
    expect(fakeApi.parse).toHaveBeenCalledWith('BV1')
    expect(useStore.getState().sourceAccountMid).toBe(7)
  })

  it('先发起的历史重开晚于新解析返回时，不会覆盖新结果和所属账号', async () => {
    updateAccounts({ activeMid: 7, accounts: [], legacyCount: 0 })
    const pending = deferred<ParseResult>()
    fakeApi.parse.mockReturnValueOnce(pending.promise)
    const opening = reopenParseRecord({ input: 'watchlater', accountMid: 8 })
    fakeApi.parse.mockResolvedValueOnce(result({ title: '当前账号的新结果' }))
    await parseLink('BV1')
    pending.resolve(result({ title: '旧账号的历史结果' }))
    await opening
    expect(useStore.getState()).toMatchObject({ parse: { title: '当前账号的新结果' }, sourceAccountMid: 7, parsing: false })
  })

  it('点击旧订阅后直接打开明细，单集也不默认勾选', async () => {
    useStore.setState({ view: 'subs' })
    fakeApi.sources.open.mockResolvedValue({ result: result({ kind: 'pgc', defaultSelected: ['pgc:5'] }) })
    await openSource(subscription, () => true)
    expect(fakeApi.sources.open).toHaveBeenCalledWith(subscription)
    expect(useStore.getState()).toMatchObject({ source: subscription, parse: { defaultSelected: [] } })
    expect(fakeApi.parse).not.toHaveBeenCalled()
    updateAuth({ loggedIn: false, expired: true })
    expect(useStore.getState().source).toBe(subscription)
  })

  it('切换账号后丢弃未完成的读取，并关闭上个账号已经打开的明细', async () => {
    useStore.setState({ view: 'subs', auth: loggedIn(7) })
    const pending = deferred<SourceDetails>()
    fakeApi.sources.open.mockReturnValueOnce(pending.promise)
    const opening = openSource(account, () => true)
    updateAuth(loggedIn(8))
    pending.resolve({ result: result(), accountMid: 7 })
    await opening
    expect(useStore.getState().parse).toBeNull()

    updateAuth(loggedIn(7))
    fakeApi.sources.open.mockResolvedValue({ result: result(), accountMid: 7 })
    await openSource(account, () => true)
    expect(useStore.getState().source).toBe(account)
    updateAuth(loggedIn(7))
    expect(useStore.getState().source).toBe(account)
    updateAuth({ loggedIn: false, expired: true })
    expect(useStore.getState()).toMatchObject({ source: null, parse: null })
  })

  it('应用内订阅的稍后再看明细在切号时关闭，过期响应也不会重新打开', async () => {
    useStore.setState({ view: 'subs', auth: loggedIn(7) })
    const bound = { result: result(), accountMid: 7 }
    fakeApi.sources.open.mockResolvedValue(bound)
    await openSource(subscription, () => true)
    expect(useStore.getState()).toMatchObject({ source: subscription, sourceAccountMid: 7 })
    updateAuth(loggedIn(8))
    expect(useStore.getState()).toMatchObject({ parse: null, source: null })
    await openSource(subscription, () => true)
    expect(useStore.getState().parse).toBeNull()
  })

  it.each([
    { view: 'subs' as const, current: false },
    { view: 'downloads' as const, current: true },
    { view: 'subs' as const, current: true, parsing: true }
  ])('不会弹出过期请求或覆盖正在进行的解析', async ({ view, current, parsing }) => {
    useStore.setState({ view, parsing: parsing ?? false })
    fakeApi.sources.open.mockResolvedValue({ result: result() })
    await openSource(subscription, () => current)
    expect(useStore.getState().parse).toBeNull()
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
