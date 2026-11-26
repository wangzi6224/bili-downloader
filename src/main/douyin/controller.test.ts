import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem, ParseResult } from '@shared/types'
import { ImportError } from '../auth/importError'
import type { PlainCookie } from '../auth/session'
import { DyAccounts } from './accounts'
import { DouyinController, type DyControllerDeps } from './controller'
import { DyError, DyLoginError, DyVerifyError } from './errors'
import type { DyUser } from './types'

const user = (n: number): DyUser => ({ uid: `uid-${n}`, sec_uid: `SEC-test-user-${n}-abcdef`, nickname: `测试用户${n}` })
const cookie = (name: string, value: string): PlainCookie => ({
  domain: '.douyin.com',
  name,
  value,
  path: '/',
  secure: true,
  httpOnly: false,
  sameSite: 'unspecified'
})

let dir = ''
let clearPartition: ReturnType<typeof vi.fn<(partition: string) => Promise<void>>>
let accounts: DyAccounts

function make() {
  const api = { self: vi.fn(async (_o: { account: string | null }) => user(1)), verify: vi.fn(async (_account: string | null) => undefined) }
  const gate = { reset: vi.fn(), expire: vi.fn() }
  const transport = { dispose: vi.fn() }
  const queue = { siteLoginChanged: vi.fn(), siteAccountRemoved: vi.fn(), siteVerified: vi.fn(), schedule: vi.fn() }
  const deps = {
    api,
    gate,
    transport,
    accounts,
    service: { parse: vi.fn<(input: string, o?: object) => Promise<ParseResult | null>>() },
    queue,
    openLogin: vi.fn(async (_partition: string) => true),
    writeCookies: vi.fn(async (_partition: string, _cookies: PlainCookie[]) => undefined),
    listBrowsers: vi.fn(() => [{ id: 'chrome:Default', browser: 'Chrome', name: '默认' }]),
    readBrowser: vi.fn(async (_profile: string) => [cookie('sessionid', 'test-session')]),
    record: vi.fn(),
    onStatus: vi.fn(),
    onNeedsUser: vi.fn()
  }
  const controller = new DouyinController(deps as unknown as DyControllerDeps)
  return { controller, ...deps }
}

const addAccount = async (n: number): Promise<{ id: string; partition: string }> => {
  const slot = accounts.prepare()
  await accounts.commit(slot.id, user(n))
  return slot
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dy-controller-'))
  clearPartition = vi.fn(async () => undefined)
  accounts = new DyAccounts(dir, { clearPartition })
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('账号事件', () => {
  it('登录或切换账号：关掉旧网页、放行限速状态、让等登录的任务接着排队', async () => {
    const { transport, gate, queue } = make()
    const slot = accounts.prepare()
    await accounts.commit(slot.id, user(1))
    expect(transport.dispose).toHaveBeenCalledWith(slot.id)
    expect(gate.reset).toHaveBeenCalledWith(slot.id)
    expect(queue.siteLoginChanged).toHaveBeenCalledWith('douyin', slot.id)
  })

  it('删除账号：清掉它的状态和网页，任务改为不登录，推送新状态', async () => {
    const { controller, transport, gate, queue, onStatus } = make()
    const { id } = await addAccount(1)
    controller.gateChanged(id, { state: 'verify' })
    transport.dispose.mockClear()
    gate.reset.mockClear()
    await accounts.remove(id)
    expect(transport.dispose).toHaveBeenCalledWith(id)
    expect(gate.reset).toHaveBeenCalledWith(id)
    expect(queue.siteAccountRemoved).toHaveBeenCalledWith('douyin', id)
    expect(onStatus).toHaveBeenLastCalledWith([])
    expect(controller.status()).toEqual([])
  })
})

describe('限速状态变化', () => {
  it('记下异常状态和冷却结束时间，恢复正常后去掉；每次都推送并让队列重新调度', () => {
    const { controller, onStatus, queue } = make()
    controller.gateChanged(null, { state: 'cooling', until: 5000 })
    controller.gateChanged('acc', { state: 'verify' })
    expect(controller.status()).toEqual([{ account: null, state: 'cooling', until: 5000 }, { account: 'acc', state: 'verify' }])
    expect(controller.status()[1]).not.toHaveProperty('until')
    expect(onStatus).toHaveBeenLastCalledWith(controller.status())
    controller.gateChanged(null, { state: 'ok' })
    expect(controller.status()).toEqual([{ account: 'acc', state: 'verify' }])
    expect(queue.schedule).toHaveBeenCalledTimes(3)
  })

  it('进入验证时只提醒一次，解除后再次进入才再提醒', () => {
    const { controller, onNeedsUser } = make()
    controller.gateChanged('acc', { state: 'verify' })
    controller.gateChanged('acc', { state: 'verify' })
    expect(onNeedsUser).toHaveBeenCalledTimes(1)
    controller.gateChanged('acc', { state: 'ok' })
    controller.gateChanged('acc', { state: 'verify' })
    expect(onNeedsUser).toHaveBeenCalledTimes(2)
    controller.gateChanged('acc', { state: 'cooling', until: 1 })
    expect(onNeedsUser).toHaveBeenCalledTimes(2)
  })

  it('登录失效时把账号标记为失效；匿名的失效状态不标记任何账号', async () => {
    const { controller } = make()
    const { id } = await addAccount(1)
    const mark = vi.spyOn(accounts, 'markExpired')
    controller.gateChanged(null, { state: 'expired' })
    expect(mark).not.toHaveBeenCalled()
    controller.gateChanged(id, { state: 'expired' })
    expect(mark).toHaveBeenCalledWith(id)
    expect(accounts.snapshot().accounts[0].status).toBe('expired')
  })
})

describe('verify', () => {
  it('验证通过后让这个账号因验证等待的任务接着排队，返回当前状态', async () => {
    const { controller, api, queue } = make()
    controller.gateChanged('other', { state: 'cooling', until: 9 })
    expect(await controller.verify('acc')).toEqual([{ account: 'other', state: 'cooling', until: 9 }])
    expect(api.verify).toHaveBeenCalledWith('acc')
    expect(queue.siteVerified).toHaveBeenCalledWith('douyin', 'acc')
  })

  it('同一个账号同时只开一个验证窗口，结束后可以再开；不同账号各开各的', async () => {
    const { controller, api } = make()
    let finish!: () => void
    api.verify.mockImplementation(() => new Promise<undefined>((r) => (finish = () => r(undefined))))
    const first = controller.verify(null)
    expect(controller.verify(null)).toBe(first)
    expect(api.verify).toHaveBeenCalledTimes(1)
    finish()
    await first
    const again = controller.verify(null)
    expect(again).not.toBe(first)
    finish()
    await again
    api.verify.mockResolvedValue(undefined)
    await Promise.all([controller.verify('a'), controller.verify('b')])
    expect(api.verify).toHaveBeenCalledTimes(4)
  })

  it('验证失败时不放行任务，之后可以重试', async () => {
    const { controller, api, queue } = make()
    api.verify.mockRejectedValueOnce(new DyError('验证没有完成'))
    await expect(controller.verify('acc')).rejects.toThrow('验证没有完成')
    expect(queue.siteVerified).not.toHaveBeenCalled()
    await controller.verify('acc')
    expect(api.verify).toHaveBeenCalledTimes(2)
  })
})

describe('扫码登录', () => {
  it('在新分区里打开登录窗口，确认身份后记成账号，用完临时网页和状态就丢', async () => {
    const { controller, openLogin, api, transport, gate } = make()
    const snapshot = await controller.login()
    const [account] = snapshot.accounts
    expect(openLogin).toHaveBeenCalledWith(`persist:douyin-${account.id}`)
    expect(api.self).toHaveBeenCalledWith({ account: account.id })
    expect(snapshot.current).toBe(account.id)
    expect(transport.dispose).toHaveBeenLastCalledWith(account.id)
    expect(gate.reset).toHaveBeenLastCalledWith(account.id)
    expect(clearPartition).not.toHaveBeenCalled()
  })

  it('用户关掉窗口：清掉分区，账号列表不变', async () => {
    const { controller, openLogin, api } = make()
    openLogin.mockResolvedValue(false)
    expect(await controller.login()).toEqual({ current: undefined, accounts: [] })
    expect(clearPartition).toHaveBeenCalledWith(openLogin.mock.calls[0][0])
    expect(api.self).not.toHaveBeenCalled()
  })

  it('打开窗口失败：清掉分区并抛出原因', async () => {
    const { controller, openLogin } = make()
    openLogin.mockRejectedValue(new Error('窗口打不开'))
    await expect(controller.login()).rejects.toThrow('窗口打不开')
    expect(clearPartition).toHaveBeenCalledWith(openLogin.mock.calls[0][0])
  })

  it('确认身份失败：清掉分区、关掉临时网页，抛出原因', async () => {
    const { controller, openLogin, api, transport, gate } = make()
    api.self.mockRejectedValue(new DyVerifyError())
    await expect(controller.login()).rejects.toBeInstanceOf(DyVerifyError)
    const partition = openLogin.mock.calls[0][0]
    expect(clearPartition).toHaveBeenCalledExactlyOnceWith(partition)
    const id = partition.replace('persist:douyin-', '')
    expect(transport.dispose).toHaveBeenCalledWith(id)
    expect(gate.reset).toHaveBeenCalledWith(id)
    expect(accounts.snapshot().accounts).toEqual([])
  })

  // 已知问题：登录窗口只开一个、两次调用共用结果，第二次却去空分区里确认身份而报“登录已失效”
  it('登录窗口还开着时再次登录，两次调用都成功', async () => {
    const { controller, openLogin, api } = make()
    let finish!: (ok: boolean) => void
    const shared = new Promise<boolean>((r) => (finish = r))
    openLogin.mockReturnValue(shared)
    // 只有真正开出窗口的那个分区里有登录信息
    api.self.mockImplementation(async ({ account }) => {
      if (!openLogin.mock.calls[0][0].endsWith(account!)) throw new DyLoginError()
      return user(1)
    })
    const both = Promise.all([controller.login(), controller.login()])
    finish(true)
    for (const snapshot of await both) expect(snapshot.accounts).toHaveLength(1)
  })
})

describe('导入登录', () => {
  it('粘贴 cookie：写进新分区后确认身份', async () => {
    const { controller, writeCookies, openLogin } = make()
    const snapshot = await controller.importCookie('sessionid=test-session; other=1')
    const [account] = snapshot.accounts
    expect(writeCookies).toHaveBeenCalledWith(`persist:douyin-${account.id}`, [
      expect.objectContaining({ name: 'sessionid', value: 'test-session' }),
      expect.objectContaining({ name: 'other', value: '1' })
    ])
    expect(openLogin).not.toHaveBeenCalled()
  })

  it('没有 sessionid 或它是空的时报缺少登录信息，不建分区', async () => {
    const { controller, writeCookies } = make()
    const prepare = vi.spyOn(accounts, 'prepare')
    await expect(controller.importCookie('other=1')).rejects.toThrow('缺少 sessionid')
    await expect(controller.importCookie('sessionid=')).rejects.toThrow('缺少 sessionid')
    expect(prepare).not.toHaveBeenCalled()
    expect(writeCookies).not.toHaveBeenCalled()
  })

  it('写 cookie 失败：清掉分区并抛出原因，不去确认身份', async () => {
    const { controller, writeCookies, api } = make()
    writeCookies.mockRejectedValue(new Error('写入失败'))
    await expect(controller.importCookie('sessionid=x')).rejects.toThrow('写入失败')
    expect(clearPartition).toHaveBeenCalledWith(writeCookies.mock.calls[0][0])
    expect(api.self).not.toHaveBeenCalled()
  })

  it('列出浏览器', () => {
    const { controller, listBrowsers } = make()
    expect(controller.listBrowsers('chrome')).toEqual([{ id: 'chrome:Default', browser: 'Chrome', name: '默认' }])
    expect(listBrowsers).toHaveBeenCalledWith('chrome')
  })

  it('从浏览器导入', async () => {
    const { controller, readBrowser, writeCookies } = make()
    expect((await controller.importBrowser('chrome:Default')).accounts).toHaveLength(1)
    expect(readBrowser).toHaveBeenCalledWith('chrome:Default')
    expect(writeCookies).toHaveBeenCalledWith(expect.any(String), [cookie('sessionid', 'test-session')])
  })

  it('浏览器里没有登录信息时说明要登录 douyin.com；别的错误原样抛出', async () => {
    const { controller, readBrowser } = make()
    readBrowser.mockRejectedValueOnce(new ImportError('no_login', '没有登录 B站'))
    await expect(controller.importBrowser('p')).rejects.toThrow('请先在浏览器里登录 douyin.com')
    const locked = new ImportError('locked', '浏览器正在运行')
    readBrowser.mockRejectedValueOnce(locked)
    await expect(controller.importBrowser('p')).rejects.toBe(locked)
    readBrowser.mockRejectedValueOnce(new Error('读不了'))
    await expect(controller.importBrowser('p')).rejects.toThrow('读不了')
  })
})

describe('检查账号', () => {
  it('先放行并重开网页再查资料，成功后更新账号', async () => {
    const { controller, gate, transport, api } = make()
    const { id } = await addAccount(1)
    accounts.markExpired(id)
    gate.reset.mockClear()
    transport.dispose.mockClear()
    api.self.mockImplementation(async () => {
      expect(gate.reset).toHaveBeenCalledWith(id)
      expect(transport.dispose).toHaveBeenCalledWith(id)
      return { ...user(1), nickname: '新名字' }
    })
    const snapshot = await controller.check(id)
    expect(snapshot.accounts[0]).toMatchObject({ name: '新名字', status: 'ready' })
  })

  it('登录已失效：记为失效状态并返回账号列表', async () => {
    const { controller, gate, api } = make()
    const { id } = await addAccount(1)
    api.self.mockRejectedValue(new DyLoginError())
    expect((await controller.check(id)).accounts[0].id).toBe(id)
    expect(gate.expire).toHaveBeenCalledWith(id)
  })

  it('别的错误原样抛出，不动账号状态', async () => {
    const { controller, gate, api } = make()
    api.self.mockRejectedValue(new DyError('网络不通'))
    await expect(controller.check('acc')).rejects.toThrow('网络不通')
    expect(gate.expire).not.toHaveBeenCalled()
  })
})

describe('parseAndRecord', () => {
  const item = (key: string): MediaItem => ({ key, kind: 'douyin', title: key, index: 1, cid: 0 })
  const result: ParseResult = {
    kind: 'douyin',
    title: '测试合集',
    cover: 'https://img.example/c.jpg',
    groups: [{ id: 'a', title: 'a', items: [item('dy:1'), item('dy:2')] }, { id: 'b', title: 'b', items: [item('dy:3')] }],
    defaultSelected: []
  }

  it('去掉首尾空白，解析并记进解析记录', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(123_000)
    const { controller, service, record } = make()
    vi.mocked(service.parse).mockResolvedValue(result)
    const signal = new AbortController().signal
    expect(await controller.parseAndRecord('  https://v.douyin.com/test/  ', { account: null, signal })).toEqual({
      ...result,
      input: 'https://v.douyin.com/test/'
    })
    expect(service.parse).toHaveBeenCalledWith('https://v.douyin.com/test/', { account: null, signal })
    expect(record).toHaveBeenCalledWith({
      input: 'https://v.douyin.com/test/',
      title: '测试合集',
      kind: 'douyin',
      cover: 'https://img.example/c.jpg',
      count: 3,
      at: 123_000
    })
  })

  it('认不出链接时报错，不记录', async () => {
    const { controller, service, record } = make()
    vi.mocked(service.parse).mockResolvedValue(null)
    await expect(controller.parseAndRecord('随便一段话')).rejects.toThrow('没有认出抖音链接')
    expect(service.parse).toHaveBeenCalledWith('随便一段话', {})
    expect(record).not.toHaveBeenCalled()
  })
})
