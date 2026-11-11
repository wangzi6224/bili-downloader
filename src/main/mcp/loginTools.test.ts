import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserProfile } from '@shared/types'
import type { LoginFlow, LoginReason, LoginSnapshot } from './loginFlow'
import { loginDefinitions, LoginTools } from './loginTools'

const OUT = { status: 'idle', tried: [], alsoAvailable: [], auth: { loggedIn: false } } satisfies LoginSnapshot
const IN = {
  ...OUT,
  status: 'logged_in',
  auth: { loggedIn: true, user: { mid: 1, uname: '用户', face: '', vipActive: true, vipLabel: '年度大会员' } }
} satisfies LoginSnapshot

let snapshot: LoginSnapshot
let interrupted: string[]
const flow = {
  start: vi.fn(async () => {}),
  wait: vi.fn(async () => {}),
  snapshot: vi.fn(() => snapshot),
  browsers: vi.fn((): BrowserProfile[] => [])
}
let tools: LoginTools

beforeEach(() => {
  vi.clearAllMocks()
  snapshot = OUT
  interrupted = []
  tools = new LoginTools(flow as unknown as LoginFlow, () => interrupted)
})

describe('定义', () => {
  it('两个工具都能处理，其他的不归它管', () => {
    expect(loginDefinitions().map((d) => d.name)).toEqual(['start_login', 'get_login_status'])
    expect(tools.handles('start_login')).toBe(true)
    expect(tools.handles('get_login_status')).toBe(true)
    expect(tools.handles('get_status')).toBe(false)
    expect(tools.handles('toString')).toBe(false)
  })

  it('没有替 agent 关闭浏览器的参数', () => {
    const def = loginDefinitions().find((d) => d.name === 'start_login')!
    expect(Object.keys(def.inputSchema.properties as object)).toEqual(['method', 'source', 'wait_seconds'])
  })
})

describe('start_login', () => {
  it('默认从浏览器导入，进行中时等 15 秒', async () => {
    flow.snapshot.mockImplementationOnce(() => ({ ...OUT, status: 'in_progress', step: 'importing' }))
    snapshot = IN
    const r = await tools.call('start_login', {})
    expect(flow.start).toHaveBeenCalledWith('browser', undefined)
    expect(flow.wait).toHaveBeenCalledWith(15_000)
    expect(r).toMatchObject({ status: 'logged_in', logged_in: true, user: '用户', vip: true, vip_label: '年度大会员', next: 'none' })
  })

  it('传 method、source、wait_seconds', async () => {
    await tools.call('start_login', { method: 'qr', source: ' edge ', wait_seconds: 3 })
    expect(flow.start).toHaveBeenCalledWith('qr', 'edge')
  })

  it('已经在等用户时不等待，让 agent 先去提醒用户', async () => {
    snapshot = { ...OUT, status: 'waiting_user', step: 'qr' }
    const r = await tools.call('start_login', { method: 'qr' })
    expect(flow.wait).not.toHaveBeenCalled()
    expect(r).toMatchObject({ status: 'waiting_user', logged_in: false, step: 'qr', next: 'tell_user', hint: expect.stringContaining('扫码') })
  })

  it.each([
    [{ method: 'password' }, 'method 必须是以下之一'],
    [{ wait_seconds: 51 }, 'wait_seconds 必须是 0～50'],
    [{ source: 1 }, 'source 必须是字符串']
  ])('参数不对时报错：%j', async (args, message) => {
    await expect(tools.call('start_login', args)).rejects.toThrow(message)
    expect(flow.start).not.toHaveBeenCalled()
  })
})

describe('get_login_status', () => {
  it('默认不等待，也不扫描浏览器', async () => {
    const r = await tools.call('get_login_status', {})
    expect(flow.wait).toHaveBeenCalledWith(0)
    expect(flow.browsers).not.toHaveBeenCalled()
    expect(r).toMatchObject({ status: 'idle', logged_in: false, next: 'none', browsers: undefined })
  })

  it('等待秒数换成毫秒', async () => {
    await tools.call('get_login_status', { wait_seconds: 50 })
    expect(flow.wait).toHaveBeenCalledWith(50_000)
  })

  it('读不到的配置档 has_login 是 null，不说成没有登录；顺序同自动选择', async () => {
    flow.browsers.mockReturnValue([
      { id: 'chrome::Default', browser: 'Chrome', profile: '个人', hasBiliLogin: false, locked: true, appBound: true },
      { id: 'chrome::Profile 1', browser: 'Chrome', profile: '工作', hasBiliLogin: true, lastUsed: true },
      { id: 'safari::', browser: 'Safari', profile: '无权限读取', hasBiliLogin: false, blocked: true },
      { id: 'edge::Default', browser: 'Edge', profile: 'Default', hasBiliLogin: false }
    ])
    const { browsers } = (await tools.call('get_login_status', { include_browsers: true })) as { browsers: unknown[] }
    expect(browsers).toEqual([
      { id: 'chrome::Profile 1', key: 'chrome', browser: 'Chrome', profile: '工作', has_login: true },
      { id: 'chrome::Default', key: 'chrome', browser: 'Chrome', profile: '个人', has_login: null, locked: true, app_bound: true },
      { id: 'safari::', key: 'safari', browser: 'Safari', profile: '无权限读取', has_login: null, blocked: true },
      { id: 'edge::Default', key: 'edge', browser: 'Edge', profile: 'Default', has_login: false }
    ])
  })

  it('结果里不含 Cookie 值', async () => {
    snapshot = { ...IN, source: { id: 'chrome::Default', browser: 'Chrome', profile: '个人' } }
    expect(JSON.stringify(await tools.call('get_login_status', {}))).not.toMatch(/SESSDATA|cookie/i)
  })
})

describe('结果里的下一步', () => {
  it('进行中时让 agent 继续等，提醒可能要点允许', async () => {
    snapshot = { ...OUT, status: 'in_progress', step: 'importing' }
    expect(await tools.call('get_login_status', {})).toMatchObject({ next: 'wait', hint: expect.stringContaining('钥匙串') })
  })

  it('还在确认登录状态', async () => {
    snapshot = { ...OUT, status: 'in_progress', step: 'checking' }
    expect(await tools.call('get_login_status', {})).toMatchObject({ next: 'wait', hint: expect.stringContaining('确认登录状态') })
  })

  it('等用户回答对话框', async () => {
    snapshot = { ...OUT, status: 'waiting_user', step: 'confirm_close' }
    expect(await tools.call('get_login_status', {})).toMatchObject({ next: 'tell_user', hint: expect.stringContaining('对话框') })
  })

  it('正在关闭浏览器', async () => {
    snapshot = { ...OUT, status: 'in_progress', step: 'closing_browser' }
    expect(await tools.call('get_login_status', {})).toMatchObject({ next: 'wait', hint: expect.stringContaining('正在关闭') })
  })

  it.each<[LoginReason, string]>([
    ['locked', 'try_qr'],
    ['app_bound', 'try_qr'],
    ['blocked', 'try_qr'],
    ['no_login', 'try_qr'],
    ['expired', 'try_qr'],
    ['keychain_denied', 'try_qr'],
    ['close_failed', 'try_qr'],
    ['not_found', 'try_qr'],
    ['failed', 'try_qr'],
    ['network', 'tell_user'],
    ['declined', 'tell_user'],
    ['confirm_timeout', 'tell_user'],
    ['window_closed', 'tell_user']
  ])('%s → %s', async (reason, next) => {
    snapshot = { ...OUT, status: 'failed', reason, message: '原因', tried: [{ browser: 'Chrome', profile: '个人', reason }] }
    const r = await tools.call('get_login_status', {})
    expect(r).toMatchObject({ status: 'failed', reason, message: '原因', next, hint: expect.any(String) })
    expect(r.tried).toHaveLength(1)
  })

  it('其他候选配置档也告诉 agent，账号不对时用户才知道能换', async () => {
    const other = { id: 'edge::Default', browser: 'Edge', profile: 'Default' }
    snapshot = { ...IN, alsoAvailable: [other] }
    expect(await tools.call('get_login_status', {})).toMatchObject({ also_available: [other] })
  })

  it('登录后提示继续被打断的批次', async () => {
    snapshot = IN
    interrupted = ['b1']
    expect(await tools.call('get_login_status', {})).toMatchObject({
      interrupted_batches: ['b1'],
      hint: expect.stringContaining('control_tasks action=resume')
    })
  })

  it('没登录时不提批次', async () => {
    interrupted = ['b1']
    expect(await tools.call('get_login_status', {})).toMatchObject({ interrupted_batches: undefined })
  })
})
