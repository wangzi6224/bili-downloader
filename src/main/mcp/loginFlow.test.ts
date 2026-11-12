import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState, BrowserProfile } from '@shared/types'
import { ImportError, LoginRevokedError } from '../auth/importError'
import { BiliError } from '../bili/http'
import { LoginFlow, rankProfiles, type LoginDeps } from './loginFlow'

const IN: AuthState = { loggedIn: true, user: { mid: 1, uname: '用户', face: '', vipActive: false, vipLabel: '' } }
const OUT: AuthState = { loggedIn: false }

const profile = (id: string, over: Partial<BrowserProfile> = {}): BrowserProfile => ({
  id,
  browser: id.split('::')[0],
  profile: id.split('::')[1] || 'Default',
  hasBiliLogin: true,
  ...over
})

let auth: AuthState
let changed: () => void
let browsers: BrowserProfile[]
let deps: { [K in keyof LoginDeps]: ReturnType<typeof vi.fn> & LoginDeps[K] }
let flow: LoginFlow

/** 模拟 authGuard：状态翻转时才回调 */
function setAuth(next: AuthState): void {
  const flipped = next.loggedIn !== auth.loggedIn
  auth = next
  if (flipped) changed()
}

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

/** 手动控制结果的 promise */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const start = async (method: 'browser' | 'qr' = 'browser', source?: string): Promise<void> => {
  await flow.start(method, source)
  await flush()
}

beforeEach(() => {
  vi.useFakeTimers()
  auth = OUT
  browsers = []
  const fakes = {
    checkAuth: vi.fn(async () => auth),
    authState: vi.fn(() => auth),
    onLoginChanged: vi.fn((fn: () => void) => {
      changed = fn
    }),
    listBrowsers: vi.fn(() => browsers),
    importBrowser: vi.fn(async (_id: string, { shouldApply }: { shouldApply: () => boolean }) => {
      if (!shouldApply()) throw new ImportError('cancelled', '这次导入已取消')
      setAuth(IN)
      return IN
    }),
    openQr: vi.fn(() => new Promise<AuthState>(() => {})),
    isQrOpen: vi.fn(() => false),
    isLocked: vi.fn(() => false),
    canClose: vi.fn((key: string) => key !== 'arc'),
    confirmClose: vi.fn(async (): Promise<'close' | 'qr' | 'cancel'> => 'close'),
    closeBrowser: vi.fn(async () => true)
  }
  deps = fakes as unknown as typeof deps
  flow = new LoginFlow(deps)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rankProfiles', () => {
  it('保持枚举顺序，同一浏览器里最近用过的排前面', () => {
    const list = rankProfiles([
      profile('chrome::Default'),
      profile('edge::Default'),
      profile('chrome::Profile 1', { lastUsed: true }),
      profile('firefox::a')
    ])
    expect(list.map((p) => p.id)).toEqual(['chrome::Profile 1', 'chrome::Default', 'edge::Default', 'firefox::a'])
  })
})

it('已有登录时仍可扫码添加后台账号，切换当前账号不会中断或冒充这次登录', async () => {
  auth = IN
  const scan = deferred<AuthState>()
  const added = { ...IN, user: { ...IN.user, mid: 2 } }
  let addedAuth: AuthState = added
  const scoped = new LoginFlow({ ...deps, accountAuth: () => addedAuth })
  deps.openQr.mockReturnValue(scan.promise)
  scoped.start('qr', undefined, { mode: 'add', activate: false })
  await flush()
  expect(deps.checkAuth).not.toHaveBeenCalled()
  expect(deps.openQr).toHaveBeenCalledWith({ mode: 'add', activate: false }, undefined)
  expect(scoped.snapshot()).toMatchObject({ status: 'waiting_user', auth: { loggedIn: false } })
  expect(() => scoped.start('qr', undefined, { mode: 'reauth', mid: 3, activate: false })).toThrow()
  changed()
  scan.resolve(added)
  await flush()
  expect(scoped.snapshot()).toMatchObject({ status: 'logged_in', auth: { user: { mid: 2 } } })
  addedAuth = OUT
  expect(scoped.snapshot()).toMatchObject({ status: 'idle', auth: { loggedIn: false } })
})

it('旧登录被退出撤销后停止尝试其他浏览器配置', async () => {
  const guard = vi.fn()
  const scoped = new LoginFlow({ ...deps, loginGuard: () => guard })
  browsers = [profile('chrome::Default'), profile('edge::Default')]
  deps.importBrowser.mockRejectedValue(new LoginRevokedError('账号已退出，这次登录已取消。'))
  const target = { mode: 'reauth', mid: 2, activate: false } as const
  scoped.start('browser', undefined, target)
  await flush()
  expect(deps.importBrowser).toHaveBeenCalledExactlyOnceWith('chrome::Default', expect.any(Object), target, guard)
  expect(scoped.snapshot()).toMatchObject({ status: 'failed', reason: 'revoked' })
})

describe('自动选择', () => {
  it('Chrome 优先，导入成功后状态是已登录，记下来源和其他候选', async () => {
    browsers = [profile('chrome::Default'), profile('edge::Default'), profile('firefox::a')]
    await start()
    expect(deps.importBrowser).toHaveBeenCalledTimes(1)
    expect(deps.importBrowser.mock.calls[0][0]).toBe('chrome::Default')
    expect(flow.snapshot()).toMatchObject({
      status: 'logged_in',
      source: { id: 'chrome::Default' },
      alsoAvailable: [{ id: 'edge::Default' }, { id: 'firefox::a' }],
      tried: []
    })
  })

  it('跳过没有登录、被锁、没权限的配置档', async () => {
    browsers = [
      profile('chrome::', { blocked: true, hasBiliLogin: false }),
      profile('chrome::Default', { locked: true, hasBiliLogin: false }),
      profile('edge::Default', { hasBiliLogin: false }),
      profile('firefox::a')
    ]
    await start()
    expect(deps.importBrowser.mock.calls[0][0]).toBe('firefox::a')
    expect(deps.confirmClose).not.toHaveBeenCalled()
  })

  it('Chrome 被锁时先用能直接读的，不去打扰用户', async () => {
    browsers = [profile('chrome::Default', { locked: true, hasBiliLogin: false }), profile('edge::Default')]
    await start()
    expect(deps.importBrowser.mock.calls[0][0]).toBe('edge::Default')
    expect(deps.confirmClose).not.toHaveBeenCalled()
  })

  it('一个失败就试下一个，记录失败原因', async () => {
    browsers = [profile('chrome::Default'), profile('edge::Default')]
    deps.importBrowser.mockRejectedValueOnce(new ImportError('expired', '已失效'))
    await start()
    expect(deps.importBrowser.mock.calls.map((c) => c[0])).toEqual(['chrome::Default', 'edge::Default'])
    expect(flow.snapshot()).toMatchObject({ status: 'logged_in', source: { id: 'edge::Default' } })
  })

  it('最多试 3 个，全失败时报最后一个原因和所有尝试', async () => {
    browsers = ['a', 'b', 'c', 'd'].map((k) => profile(`${k}::Default`))
    deps.importBrowser.mockRejectedValue(new ImportError('expired', '已失效'))
    await start()
    expect(deps.importBrowser).toHaveBeenCalledTimes(3)
    const s = flow.snapshot()
    expect(s).toMatchObject({ status: 'failed', reason: 'expired', message: '已失效' })
    expect(s.tried.map((t) => t.browser)).toEqual(['a', 'b', 'c'])
  })

  it.each([
    ['钥匙串被拒绝', new ImportError('keychain_denied', '没授权'), 'keychain_denied'],
    ['网络失败', new BiliError('网络错误'), 'network']
  ])('%s时立即停下，不连续弹授权', async (_n, err, reason) => {
    browsers = [profile('chrome::Default'), profile('edge::Default'), profile('arc::Default', { locked: true })]
    deps.importBrowser.mockRejectedValue(err)
    await start()
    expect(deps.importBrowser).toHaveBeenCalledTimes(1)
    expect(deps.confirmClose).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason })
  })

  it('未知错误记为 failed', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockRejectedValue(new Error('读库失败'))
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'failed', message: '读库失败' })
  })

  it('字符串异常也能显示', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockRejectedValue('炸了')
    await start()
    expect(flow.snapshot().message).toBe('炸了')
  })

  it('枚举浏览器时抛错也会结束流程', async () => {
    deps.listBrowsers.mockImplementation(() => {
      throw new Error('读目录失败')
    })
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'failed', message: '读目录失败' })
  })

  it.each<[string, () => BrowserProfile[], string]>([
    ['没有浏览器', () => [], 'not_found'],
    ['都没登录', () => [profile('chrome::Default', { hasBiliLogin: false })], 'no_login'],
    ['只有 blocked', () => [profile('safari::', { blocked: true, hasBiliLogin: false })], 'blocked'],
    ['被锁且启用了应用绑定加密', () => [profile('chrome::Default', { locked: true, appBound: true })], 'app_bound'],
    ['登录是应用绑定加密的，不去尝试导入', () => [profile('chrome::Default', { appBoundLogin: true })], 'app_bound'],
    ['被锁但不能代为关闭', () => [profile('arc::Default', { locked: true })], 'locked'],
    ['占位记录不算能关闭的', () => [profile('chrome::', { locked: true })], 'locked']
  ])('%s', async (_n, list, reason) => {
    browsers = list()
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason })
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(deps.confirmClose).not.toHaveBeenCalled()
  })

  it('有的没权限、其余没登录时说明缺权限的是哪个', async () => {
    browsers = [profile('chrome::Default', { hasBiliLogin: false }), profile('Safari::', { browser: 'Safari', blocked: true, hasBiliLogin: false })]
    await start()
    expect(flow.snapshot()).toMatchObject({ reason: 'no_login', message: expect.stringContaining('Safari 没有读取权限') })
  })
})

describe('指定浏览器', () => {
  it('接受浏览器 key 和完整 id', async () => {
    browsers = [profile('chrome::Default'), profile('edge::Default'), profile('edge::Profile 1')]
    await start('browser', 'edge::Profile 1')
    expect(deps.importBrowser.mock.calls[0][0]).toBe('edge::Profile 1')
    flow.dispose()
    setAuth(OUT)
    deps.importBrowser.mockClear()
    await start('browser', 'edge')
    expect(deps.importBrowser.mock.calls[0][0]).toBe('edge::Default')
    expect(deps.listBrowsers.mock.calls).toEqual([['edge'], ['edge']])
  })

  it('没有这个浏览器', async () => {
    browsers = [profile('chrome::Default')]
    await start('browser', 'edge')
    expect(flow.snapshot()).toMatchObject({ reason: 'not_found' })
  })

  it('读取失败时不换别的浏览器', async () => {
    browsers = [profile('chrome::Default'), profile('edge::Default')]
    deps.importBrowser.mockRejectedValue(new ImportError('expired', '已失效'))
    await start('browser', 'chrome')
    expect(deps.importBrowser).toHaveBeenCalledTimes(1)
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'expired' })
  })

  it('读取时用户拒绝钥匙串，直接失败', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockRejectedValue(new ImportError('keychain_denied', '没授权'))
    await start('browser', 'chrome')
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'keychain_denied' })
  })

  it.each(['safari', 'safari::Default'])('来源 %s 缺权限时返回 blocked，不尝试导入', async (source) => {
    browsers = [profile('safari::', { browser: 'Safari', blocked: true, hasBiliLogin: false })]
    await start('browser', source)
    expect(deps.listBrowsers).toHaveBeenCalledExactlyOnceWith('safari')
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ reason: 'blocked', message: '没有权限读取 Safari 的数据' })
  })

  it('点名的浏览器登录是应用绑定加密的', async () => {
    browsers = [profile('edge::Default', { browser: 'Edge', appBoundLogin: true })]
    await start('browser', 'edge')
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ reason: 'app_bound', message: expect.stringContaining('Edge 里的 B站登录用应用绑定加密') })
  })

  it('里面没有登录', async () => {
    browsers = [profile('chrome::Default', { hasBiliLogin: false })]
    await start('browser', 'chrome')
    expect(flow.snapshot()).toMatchObject({ reason: 'no_login' })
  })

  it('被锁且能关闭时才问；启用了应用绑定加密也问，并告诉对话框', async () => {
    browsers = [profile('chrome::Default', { locked: true, appBound: true, hasBiliLogin: false })]
    deps.confirmClose.mockResolvedValue('cancel')
    await start('browser', 'chrome')
    expect(deps.confirmClose).toHaveBeenCalledWith('chrome', true, expect.any(AbortSignal))
  })

  it('被锁但不能代为关闭时让用户手动退出', async () => {
    browsers = [profile('arc::Default', { locked: true, hasBiliLogin: false })]
    await start('browser', 'arc')
    expect(deps.confirmClose).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ reason: 'locked' })
  })
})

describe('关闭浏览器', () => {
  const locked = (): BrowserProfile => profile('chrome::Default', { browser: 'Chrome', locked: true, hasBiliLogin: false })

  it('用户同意后关闭，重新扫描再导入，选关闭后读到的配置档', async () => {
    browsers = [locked()]
    deps.closeBrowser.mockImplementation(async () => {
      browsers = [
        profile('chrome::Default', { browser: 'Chrome', hasBiliLogin: false }),
        profile('chrome::Profile 1', { browser: 'Chrome' }),
        profile('edge::Default')
      ]
      return true
    })
    await start()
    expect(deps.closeBrowser.mock.calls[0][0]).toBe('chrome')
    expect(deps.listBrowsers.mock.calls).toEqual([[], ['chrome']])
    expect(deps.importBrowser.mock.calls.map((c) => c[0])).toEqual(['chrome::Profile 1'])
    expect(flow.snapshot().status).toBe('logged_in')
  })

  it('isLocked 和 alive 接到真实状态上', async () => {
    browsers = [locked()]
    deps.closeBrowser.mockImplementation(async (_k, isLocked, alive) => {
      expect(alive()).toBe(true)
      isLocked()
      flow.dispose()
      expect(alive()).toBe(false)
      return false
    })
    await start()
    expect(deps.isLocked).toHaveBeenCalledWith('chrome::Default')
    expect(flow.snapshot().status).toBe('idle')
  })

  it('进入确认时状态是等待用户，source 指向这个浏览器', async () => {
    browsers = [locked()]
    deps.confirmClose.mockReturnValue(new Promise(() => {}))
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'confirm_close', source: { id: 'chrome::Default' } })
  })

  it('用户拒绝', async () => {
    browsers = [locked()]
    deps.confirmClose.mockResolvedValue('cancel')
    await start()
    expect(deps.closeBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'declined' })
  })

  it('用户选改用扫码', async () => {
    browsers = [locked()]
    deps.confirmClose.mockResolvedValue('qr')
    await start()
    expect(deps.openQr).toHaveBeenCalledTimes(1)
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'qr' })
  })

  it('对话框 120 秒没人理就收起，不算拒绝', async () => {
    browsers = [locked()]
    deps.confirmClose.mockImplementation(
      (_b, _a, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve('cancel')))
    )
    await start()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'confirm_timeout' })
  })

  it('对话框出错时流程失败', async () => {
    browsers = [locked()]
    deps.confirmClose.mockRejectedValue(new Error('弹不出来'))
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'failed', message: '弹不出来' })
  })

  it('没能关闭', async () => {
    browsers = [locked()]
    deps.closeBrowser.mockResolvedValue(false)
    await start()
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'close_failed' })
  })

  it('关了才发现没有登录', async () => {
    browsers = [locked()]
    deps.closeBrowser.mockImplementation(async () => {
      browsers = [profile('chrome::Default', { browser: 'Chrome', hasBiliLogin: false })]
      return true
    })
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'no_login', message: expect.stringContaining('已关闭') })
  })

  it('关了才看出登录是应用绑定加密的，不再尝试导入', async () => {
    browsers = [locked()]
    deps.closeBrowser.mockImplementation(async () => {
      browsers = [profile('chrome::Default', { browser: 'Chrome', appBoundLogin: true })]
      return true
    })
    await start()
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'app_bound' })
  })

  it('关了导入失败时报告原因，比如 v20 加密', async () => {
    browsers = [locked()]
    deps.closeBrowser.mockImplementation(async () => {
      browsers = [profile('chrome::Default', { browser: 'Chrome' })]
      return true
    })
    deps.importBrowser.mockRejectedValue(new ImportError('app_bound', '应用绑定'))
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'app_bound' })
  })

  it('关了导入时被拒绝授权，直接失败', async () => {
    browsers = [locked()]
    deps.closeBrowser.mockImplementation(async () => {
      browsers = [profile('chrome::Default', { browser: 'Chrome' })]
      return true
    })
    deps.importBrowser.mockRejectedValue(new ImportError('keychain_denied', '没授权'))
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'keychain_denied' })
  })

  it('读到的试完了才问，失败原因不丢', async () => {
    browsers = [profile('edge::Default'), locked()]
    deps.importBrowser.mockRejectedValue(new ImportError('expired', '已失效'))
    deps.confirmClose.mockResolvedValue('cancel')
    await start()
    expect(deps.confirmClose).toHaveBeenCalledTimes(1)
    expect(flow.snapshot().tried).toEqual([{ browser: 'edge', profile: 'Default', reason: 'expired' }])
  })

  it('等用户回答时用户已经登录，对话框收起，不再关闭浏览器', async () => {
    browsers = [locked()]
    deps.confirmClose.mockImplementation(
      (_b, _a, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve('close')))
    )
    await start()
    setAuth(IN)
    await flush()
    expect(deps.closeBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot().status).toBe('logged_in')
  })

  it('等用户回答时对话框出错但流程已作废，不覆盖状态', async () => {
    browsers = [locked()]
    const d = deferred<'close'>()
    deps.confirmClose.mockReturnValue(d.promise)
    await start()
    flow.dispose()
    d.reject(new Error('迟到的错误'))
    await flush()
    expect(flow.snapshot().status).toBe('idle')
  })
})

describe('扫码', () => {
  it('打开窗口后等用户，登录成功时不再有 reason', async () => {
    await start('qr')
    expect(deps.openQr).toHaveBeenCalledTimes(1)
    expect(deps.listBrowsers).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'qr' })
    setAuth(IN)
    expect(flow.snapshot()).toMatchObject({ status: 'logged_in', step: undefined })
  })

  it('用户关掉窗口', async () => {
    const d = deferred<AuthState>()
    deps.openQr.mockReturnValue(d.promise)
    await start('qr')
    d.resolve(OUT)
    await flush()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'window_closed' })
  })

  it('窗口返回已登录但没触发过登录变化时也结束等待', async () => {
    const d = deferred<AuthState>()
    deps.openQr.mockReturnValue(d.promise)
    await start('qr')
    auth = IN
    d.resolve(IN)
    await flush()
    expect(flow.snapshot().status).toBe('logged_in')
  })

  it('窗口打不开', async () => {
    deps.openQr.mockRejectedValue(new Error('建窗口失败'))
    await start('qr')
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'failed', message: '建窗口失败' })
  })

  it('登录成功后窗口才关闭，不算用户取消', async () => {
    const d = deferred<AuthState>()
    deps.openQr.mockReturnValue(d.promise)
    await start('qr')
    setAuth(IN)
    d.resolve(IN)
    await flush()
    expect(flow.snapshot()).toMatchObject({ status: 'logged_in', reason: undefined })
  })

  it('扫码开窗前和开窗后重复发起，都保留原来的扫码和结果', async () => {
    auth = IN
    const d = deferred<AuthState>()
    deps.openQr.mockReturnValueOnce(d.promise).mockRejectedValue(new Error('已有登录操作正在进行。'))
    const target = { mode: 'add', activate: false } as const
    flow.start('qr', undefined, target)
    flow.start('qr', undefined, target)
    await flush()
    flow.start('qr', undefined, target)
    await flush()
    expect(deps.openQr).toHaveBeenCalledOnce()
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'qr' })
    const added = { ...IN, user: { ...IN.user, mid: 2 } }
    d.resolve(added)
    await flush()
    expect(flow.snapshot()).toMatchObject({ status: 'logged_in', auth: added })
  })

  it('登录窗已经开着时不导入，直接等它', async () => {
    deps.isQrOpen.mockReturnValue(true)
    browsers = [profile('chrome::Default')]
    await start()
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(deps.openQr).toHaveBeenCalledTimes(1)
    expect(flow.snapshot().step).toBe('qr')
  })

  it('正在扫码时再次要求导入不会打断', async () => {
    browsers = [profile('chrome::Default')]
    await start('qr')
    deps.checkAuth.mockClear()
    await start('browser')
    expect(deps.checkAuth).not.toHaveBeenCalled()
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot().step).toBe('qr')
  })
})

describe('竞态', () => {
  it('已登录时什么都不做，不替换账号', async () => {
    auth = IN
    browsers = [profile('chrome::Default')]
    await start()
    await start('qr')
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(deps.openQr).not.toHaveBeenCalled()
    expect(flow.snapshot().status).toBe('logged_in')
  })

  it('确认登录状态时断网：报 network，不去碰浏览器', async () => {
    deps.checkAuth.mockRejectedValue(new BiliError('网络错误'))
    browsers = [profile('chrome::Default')]
    await start()
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'network', message: '网络错误' })
  })

  it('导入进行中再次调用是同一个流程，也不 checkAuth', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockReturnValue(new Promise(() => {}))
    await start()
    deps.checkAuth.mockClear()
    await start()
    expect(deps.importBrowser).toHaveBeenCalledTimes(1)
    expect(deps.checkAuth).not.toHaveBeenCalled()
  })

  it('两个请求同时来也只跑一次，第二个的网络错误不会作废第一个', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockReturnValue(new Promise(() => {}))
    deps.checkAuth.mockResolvedValueOnce(OUT).mockRejectedValue(new BiliError('网络错误'))
    flow.start('browser')
    flow.start('browser')
    await flush()
    expect(deps.checkAuth).toHaveBeenCalledTimes(1)
    expect(deps.importBrowser).toHaveBeenCalledTimes(1)
    expect(flow.snapshot()).toMatchObject({ status: 'in_progress', step: 'importing' })
  })

  it('发起时不等网络：确认登录卡住时工具调用也能立即返回', () => {
    deps.checkAuth.mockReturnValue(new Promise(() => {}))
    flow.start('browser')
    expect(flow.snapshot()).toMatchObject({ status: 'in_progress', step: 'checking' })
  })

  it('内存里是已登录、实际已过期：不当成已登录，接着导入', async () => {
    auth = IN
    browsers = [profile('chrome::Default')]
    deps.checkAuth.mockImplementationOnce(async () => {
      setAuth(OUT)
      return OUT
    })
    flow.start('browser')
    expect(flow.snapshot().status).toBe('in_progress')
    await flush()
    expect(deps.importBrowser).toHaveBeenCalledTimes(1)
    expect(flow.snapshot().status).toBe('logged_in')
  })

  it('确认时发现其实已登录：翻转过来也算结束，不导入', async () => {
    browsers = [profile('chrome::Default')]
    deps.checkAuth.mockImplementationOnce(async () => {
      setAuth(IN)
      return IN
    })
    await start()
    expect(deps.importBrowser).not.toHaveBeenCalled()
    expect(flow.snapshot().status).toBe('logged_in')
  })

  it('确认时流程被作废，迟到的结果和错误都不算数', async () => {
    const a = deferred<AuthState>()
    const b = deferred<AuthState>()
    deps.checkAuth.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    flow.start('browser')
    await flush()
    flow.dispose()
    a.resolve(OUT)
    await flush()
    flow.start('browser')
    await flush()
    flow.dispose()
    b.reject(new BiliError('迟到'))
    await flush()
    expect(deps.listBrowsers).not.toHaveBeenCalled()
    expect(flow.snapshot().status).toBe('idle')
  })

  it('Cookie 替换已经开始时改用扫码：等它结束才开窗，导入成功就不开了', async () => {
    browsers = [profile('chrome::Default')]
    const d = deferred<AuthState>()
    deps.importBrowser.mockImplementation((_id, { shouldApply }) => {
      expect(shouldApply()).toBe(true)
      return d.promise
    })
    await start()
    await start('qr')
    expect(deps.openQr).not.toHaveBeenCalled()
    expect(flow.snapshot()).toMatchObject({ status: 'in_progress', step: 'checking' })
    setAuth(IN)
    d.resolve(IN)
    await flush()
    expect(deps.openQr).not.toHaveBeenCalled()
    expect(flow.snapshot().status).toBe('logged_in')
  })

  it('Cookie 替换失败后才开窗，回滚不会清掉用户正在登录的分区', async () => {
    browsers = [profile('chrome::Default')]
    const d = deferred<AuthState>()
    deps.importBrowser.mockImplementation((_id, { shouldApply }) => {
      shouldApply()
      return d.promise
    })
    await start()
    await start('qr')
    d.reject(new ImportError('expired', '已失效'))
    await flush()
    expect(deps.openQr).toHaveBeenCalledTimes(1)
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'qr', reason: undefined })
  })

  it('已作废的导入不会清掉新流程的替换标记', async () => {
    browsers = [profile('chrome::Default')]
    const old = deferred<AuthState>()
    const next = deferred<AuthState>()
    deps.importBrowser.mockReturnValueOnce(old.promise)
    await start()
    await start('qr')
    deps.openQr.mockClear()
    flow.dispose()
    deps.importBrowser.mockImplementationOnce((_id, { shouldApply }) => {
      shouldApply()
      return next.promise
    })
    await start()
    old.reject(new ImportError('cancelled', '这次导入已取消'))
    await flush()
    await start('qr')
    expect(deps.openQr).not.toHaveBeenCalled()
  })

  it('读浏览器时用户打开了登录窗：不替换 Cookie，转去等登录窗', async () => {
    browsers = [profile('chrome::Default')]
    const reading = deferred<void>()
    deps.importBrowser.mockImplementation(async (_id, { shouldApply }) => {
      await reading.promise
      if (!shouldApply()) throw new ImportError('cancelled', '这次导入已取消')
      return IN
    })
    await start()
    deps.isQrOpen.mockReturnValue(true)
    reading.resolve()
    await flush()
    expect(deps.openQr).toHaveBeenCalledTimes(1)
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'qr', source: undefined, alsoAvailable: [] })
  })

  it('读浏览器时用户自己登录了：结果不说来自这个浏览器', async () => {
    browsers = [profile('chrome::Default'), profile('edge::Default')]
    deps.importBrowser.mockReturnValue(new Promise(() => {}))
    await start()
    setAuth(IN)
    expect(flow.snapshot()).toMatchObject({ status: 'logged_in', source: undefined, alsoAvailable: [] })
  })

  it('进入等待时不带前一个配置档的失败原因', async () => {
    browsers = [profile('edge::Default'), profile('chrome::Default', { locked: true, hasBiliLogin: false })]
    deps.importBrowser.mockRejectedValue(new ImportError('expired', '已失效'))
    deps.confirmClose.mockResolvedValue('qr')
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'qr', reason: undefined, message: undefined })
    expect(flow.snapshot().tried).toHaveLength(1)
  })

  it('导入中改用扫码：旧导入作废，迟到的失败不覆盖扫码状态', async () => {
    browsers = [profile('chrome::Default')]
    const d = deferred<AuthState>()
    deps.importBrowser.mockReturnValue(d.promise)
    await start()
    await start('qr')
    d.reject(new ImportError('cancelled', '这次导入已取消'))
    await flush()
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'qr', tried: [] })
  })

  it('导入卡在授权上时改用扫码：先放弃这次导入，再开扫码窗', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockReturnValue(new Promise(() => {}))
    await start()
    const { signal } = deps.importBrowser.mock.calls[0][1]
    expect(signal.aborted).toBe(false)
    await start('qr')
    expect(signal.aborted).toBe(true)
    expect(deps.openQr).toHaveBeenCalledTimes(1)
    expect(flow.snapshot()).toMatchObject({ status: 'waiting_user', step: 'qr' })
  })

  it('已经开始替换 Cookie 的导入不放弃', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockImplementation((_id, { shouldApply }) => {
      shouldApply()
      return new Promise(() => {})
    })
    await start()
    const { signal } = deps.importBrowser.mock.calls[0][1]
    flow.start('qr')
    expect(signal.aborted).toBe(false)
  })

  it('shouldApply：流程作废或用户已登录后不再替换', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockReturnValue(new Promise(() => {}))
    await start()
    const { shouldApply } = deps.importBrowser.mock.calls[0][1]
    expect(shouldApply()).toBe(true)
    await start('qr')
    expect(shouldApply()).toBe(false)
  })

  it('用户在应用里自己登录：唤醒等待，来源不算这次导入的', async () => {
    browsers = [profile('chrome::Default', { hasBiliLogin: false })]
    await start()
    expect(flow.snapshot().status).toBe('failed')
    setAuth(IN)
    expect(flow.snapshot()).toMatchObject({ status: 'logged_in', source: undefined, reason: undefined })
  })

  it('取消信号里的未知原因也不会让流程崩溃', async () => {
    browsers = [profile('chrome::Default')]
    deps.importBrowser.mockRejectedValue(new ImportError('cancelled', '这次导入已取消'))
    await start()
    expect(flow.snapshot()).toMatchObject({ status: 'failed', reason: 'failed' })
  })

  it('退出登录后不留着上次的失败', async () => {
    auth = IN
    await start()
    setAuth(OUT)
    expect(flow.snapshot().status).toBe('idle')
  })

  it('dispose 后迟到的导入结果不改状态', async () => {
    browsers = [profile('chrome::Default')]
    const d = deferred<AuthState>()
    deps.importBrowser.mockReturnValue(d.promise)
    await start()
    flow.dispose()
    d.resolve(OUT)
    await flush()
    expect(flow.snapshot().status).toBe('idle')
  })

  it('browsers 列出本机浏览器', () => {
    browsers = [profile('chrome::Default')]
    expect(flow.browsers()).toBe(browsers)
  })
})

describe('wait', () => {
  it('确认阶段不算已登录，内存状态过期时也会等结果', async () => {
    auth = IN
    const d = deferred<AuthState>()
    deps.checkAuth.mockReturnValue(d.promise)
    flow.start('qr')
    let done = false
    void flow.wait(50_000).then(() => (done = true))
    await flush()
    expect(done).toBe(false)
    auth = OUT
    d.resolve(OUT)
    await flush()
    expect(done).toBe(true)
    expect(flow.snapshot().step).toBe('qr')
  })

  it('不等待时立即返回', async () => {
    await flow.wait(0)
  })

  it('已登录或已失败时立即返回', async () => {
    await start()
    expect(flow.snapshot().status).toBe('failed')
    await flow.wait(50_000)
    setAuth(IN)
    await flow.wait(50_000)
  })

  it('在等用户时等到登录成功的那一刻', async () => {
    await start('qr')
    let done = false
    void flow.wait(50_000).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(done).toBe(false)
    setAuth(IN)
    await flush()
    expect(done).toBe(true)
  })

  it('空闲时用户自己登录也会唤醒', async () => {
    let done = false
    void flow.wait(50_000).then(() => (done = true))
    setAuth(IN)
    await flush()
    expect(done).toBe(true)
  })

  it('超时返回，并移除监听', async () => {
    await start('qr')
    const p = flow.wait(1000)
    expect(flow.listenerCount('change')).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    await p
    expect(flow.listenerCount('change')).toBe(0)
  })

  it('进入需要用户操作时返回，agent 好去提醒用户', async () => {
    browsers = [profile('edge::Default'), profile('chrome::Default', { locked: true, hasBiliLogin: false })]
    const importing = deferred<AuthState>()
    deps.importBrowser.mockReturnValue(importing.promise)
    deps.confirmClose.mockReturnValue(new Promise(() => {}))
    await start()
    const p = flow.wait(50_000)
    importing.reject(new ImportError('expired', '已失效'))
    await p
    expect(flow.snapshot().step).toBe('confirm_close')
  })

  it('进行中的步骤之间不返回', async () => {
    browsers = [profile('chrome::Default', { locked: true, hasBiliLogin: false })]
    const closing = deferred<boolean>()
    deps.closeBrowser.mockReturnValue(closing.promise)
    const d = deferred<'close'>()
    deps.confirmClose.mockReturnValue(d.promise)
    await start()
    let done = false
    void flow.wait(50_000).then(() => (done = true))
    d.resolve('close')
    await flush()
    expect(flow.snapshot().step).toBe('closing_browser')
    expect(done).toBe(false)
    browsers = [profile('chrome::Default')]
    closing.resolve(true)
    await flush()
    expect(done).toBe(true)
  })
})
