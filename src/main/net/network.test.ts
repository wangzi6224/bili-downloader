import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '@shared/types'

const m = vi.hoisted(() => ({
  resolveProxy: vi.fn(),
  setProxy: vi.fn(),
  setFetchProxy: vi.fn()
}))

vi.mock('electron', () => ({ session: { defaultSession: { resolveProxy: m.resolveProxy } } }))
vi.mock('../auth/session', () => ({ biliSession: () => ({ setProxy: m.setProxy }) }))
// 解析用真实实现，setFetchProxy 包一层以便断言
vi.mock('./proxy', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./proxy')>()
  return { ...orig, setFetchProxy: m.setFetchProxy.mockImplementation(orig.setFetchProxy) }
})

const cfg = (mode: Settings['proxy']['mode'], url = ''): Settings => ({ proxy: { mode, url } }) as Settings

let net: typeof import('./network')

beforeEach(async () => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  m.setProxy.mockResolvedValue(undefined)
  m.resolveProxy.mockResolvedValue('DIRECT')
  // 模块里记着上次应用的配置和状态，每个用例重新加载
  vi.resetModules()
  net = await import('./network')
})

afterAll(async () => {
  const { setFetchProxy } = await import('./proxy')
  setFetchProxy(undefined)
})

describe('applyNetwork', () => {
  it('初始状态为直连', () => {
    expect(net.networkStatus()).toBe('直连')
  })

  it('手动代理：Chromium 会话和 fetch 用同一个地址', async () => {
    expect(await net.applyNetwork(cfg('manual', '127.0.0.1:7890'))).toBe('通过 http://127.0.0.1:7890 连接')
    expect(m.setProxy).toHaveBeenCalledWith({ proxyRules: 'http=127.0.0.1:7890;https=127.0.0.1:7890' })
    expect(m.setFetchProxy).toHaveBeenCalledWith('http://127.0.0.1:7890')
    expect(net.networkStatus()).toBe('通过 http://127.0.0.1:7890 连接')
  })

  it('手动代理带账号时，状态文案里的凭据打码', async () => {
    const s = await net.applyNetwork(cfg('manual', 'http://user:secret@proxy.local:8080'))
    expect(s).toBe('通过 http://***@proxy.local:8080 连接')
    expect(m.setFetchProxy).toHaveBeenCalledWith('http://user:secret@proxy.local:8080')
  })

  it('跟随系统：用系统解析出的代理', async () => {
    m.resolveProxy.mockResolvedValue('PROXY 10.0.0.1:3128; DIRECT')
    expect(await net.applyNetwork(cfg('system'))).toBe('通过 http://10.0.0.1:3128 连接')
    expect(m.resolveProxy).toHaveBeenCalledWith('https://api.bilibili.com')
    expect(m.setProxy).toHaveBeenCalledWith({ mode: 'system' })
    expect(m.setFetchProxy).toHaveBeenCalledWith('http://10.0.0.1:3128')
  })

  it('跟随系统但系统没设代理时，说明是直连', async () => {
    expect(await net.applyNetwork(cfg('system'))).toBe('跟随系统（系统未设置代理，直连）')
    expect(m.setFetchProxy).toHaveBeenCalledWith(undefined)
  })

  it('直连', async () => {
    expect(await net.applyNetwork(cfg('direct'))).toBe('直连')
    expect(m.setProxy).toHaveBeenCalledWith({ mode: 'direct' })
    expect(m.setFetchProxy).toHaveBeenCalledWith(undefined)
  })

  it('配置不变时不重复应用，force 时重新应用', async () => {
    await net.applyNetwork(cfg('manual', '127.0.0.1:7890'))
    expect(await net.applyNetwork(cfg('manual', '127.0.0.1:7890'))).toBe('通过 http://127.0.0.1:7890 连接')
    expect(m.setProxy).toHaveBeenCalledTimes(1)
    await net.applyNetwork(cfg('manual', '127.0.0.1:7890'), true)
    expect(m.setProxy).toHaveBeenCalledTimes(2)
    // 换了配置就重新应用
    await net.applyNetwork(cfg('direct'))
    expect(m.setProxy).toHaveBeenCalledTimes(3)
  })

  it('地址不合法时退回直连并说明原因', async () => {
    const s = await net.applyNetwork(cfg('manual', 'socks5://127.0.0.1:7891'))
    expect(s).toBe('代理设置有误，已改为直连：暂不支持 SOCKS 代理，请改用 HTTP 代理端口')
    expect(m.setProxy).not.toHaveBeenCalled()
    expect(m.setFetchProxy).toHaveBeenLastCalledWith(undefined)
    expect(net.networkStatus()).toBe(s)
  })

  it('系统代理是 SOCKS、会话设置失败时同样退回直连', async () => {
    m.resolveProxy.mockResolvedValue('SOCKS5 127.0.0.1:7891')
    expect(await net.applyNetwork(cfg('system'))).toContain('代理设置有误，已改为直连：系统代理是 SOCKS 类型')
    m.setProxy.mockRejectedValueOnce('bad rules')
    expect(await net.applyNetwork(cfg('direct'))).toBe('代理设置有误，已改为直连：bad rules')
    expect(m.setFetchProxy).toHaveBeenLastCalledWith(undefined)
  })
})
