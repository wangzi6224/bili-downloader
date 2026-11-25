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
    expect(net.networkStatus()).toEqual({ text: '直连', error: false })
  })

  it('手动代理：Chromium 会话和 fetch 用同一个地址', async () => {
    expect(await net.applyNetwork(cfg('manual', '127.0.0.1:7890'))).toEqual({ text: '通过 http://127.0.0.1:7890 连接', error: false })
    expect(m.setProxy).toHaveBeenCalledWith({ proxyRules: 'http=127.0.0.1:7890;https=127.0.0.1:7890' })
    expect(m.setFetchProxy).toHaveBeenCalledWith('http://127.0.0.1:7890')
    expect(net.networkStatus().text).toBe('通过 http://127.0.0.1:7890 连接')
  })

  it('手动代理带账号时，状态文案里的凭据打码', async () => {
    const { text: s } = await net.applyNetwork(cfg('manual', 'http://user:secret@proxy.local:8080'))
    expect(s).toBe('通过 http://***@proxy.local:8080 连接')
    expect(m.setFetchProxy).toHaveBeenCalledWith('http://user:secret@proxy.local:8080')
  })

  it('跟随系统：用系统解析出的代理', async () => {
    m.resolveProxy.mockResolvedValue('PROXY 10.0.0.1:3128; DIRECT')
    expect((await net.applyNetwork(cfg('system'))).text).toBe('通过 http://10.0.0.1:3128 连接')
    expect(m.resolveProxy).toHaveBeenCalledWith('https://api.bilibili.com')
    expect(m.setProxy).toHaveBeenCalledWith({ mode: 'system' })
    expect(m.setFetchProxy).toHaveBeenCalledWith('http://10.0.0.1:3128')
  })

  it('跟随系统但系统没设代理时，说明是直连', async () => {
    expect((await net.applyNetwork(cfg('system'))).text).toBe('跟随系统（系统未设置代理，直连）')
    expect(m.setFetchProxy).toHaveBeenCalledWith(undefined)
  })

  it('直连', async () => {
    expect((await net.applyNetwork(cfg('direct'))).text).toBe('直连')
    expect(m.setProxy).toHaveBeenCalledWith({ mode: 'direct' })
    expect(m.setFetchProxy).toHaveBeenCalledWith(undefined)
  })

  it('配置不变时不重复应用，force 时重新应用', async () => {
    await net.applyNetwork(cfg('manual', '127.0.0.1:7890'))
    expect((await net.applyNetwork(cfg('manual', '127.0.0.1:7890'))).text).toBe('通过 http://127.0.0.1:7890 连接')
    expect(m.setProxy).toHaveBeenCalledTimes(1)
    await net.applyNetwork(cfg('manual', '127.0.0.1:7890'), true)
    expect(m.setProxy).toHaveBeenCalledTimes(2)
    // 换了配置就重新应用
    await net.applyNetwork(cfg('direct'))
    expect(m.setProxy).toHaveBeenCalledTimes(3)
  })

  it('地址不合法时退回直连并说明原因', async () => {
    const s = await net.applyNetwork(cfg('manual', 'socks5://127.0.0.1:7891'))
    expect(s).toEqual({ text: '代理设置有误，已改为直连：暂不支持 SOCKS 代理，请改用 HTTP 代理端口', error: true })
    expect(m.setProxy).not.toHaveBeenCalled()
    expect(m.setFetchProxy).toHaveBeenLastCalledWith(undefined)
    expect(net.networkStatus()).toEqual(s)
  })

  it('系统代理是 SOCKS、会话设置失败时同样退回直连', async () => {
    m.resolveProxy.mockResolvedValue('SOCKS5 127.0.0.1:7891')
    expect((await net.applyNetwork(cfg('system'))).text).toContain('代理设置有误，已改为直连：系统代理是 SOCKS 类型')
    m.setProxy.mockRejectedValueOnce('bad rules')
    expect((await net.applyNetwork(cfg('direct'))).text).toBe('代理设置有误，已改为直连：bad rules')
    expect(m.setFetchProxy).toHaveBeenLastCalledWith(undefined)
  })
})

describe('ytProxyFromResolved', () => {
  it.each([
    ['PROXY 10.0.0.1:3128; DIRECT', 'http://10.0.0.1:3128'],
    ['proxy 10.0.0.1:3128', 'http://10.0.0.1:3128'],
    ['HTTPS proxy.local:443', 'https://proxy.local:443'],
    ['SOCKS5 127.0.0.1:7891; PROXY 1.1.1.1:80', 'socks5://127.0.0.1:7891'],
    ['SOCKS4 127.0.0.1:1080', 'socks4://127.0.0.1:1080'],
    ['SOCKS 127.0.0.1:1080', 'socks4://127.0.0.1:1080'],
    ['DIRECT', ''],
    ['DIRECT; PROXY 10.0.0.1:3128', ''],
    ['', ''],
    ['QUIC 1.1.1.1:443', '']
  ])('%s → %s', (resolved, want) => {
    expect(net.ytProxyFromResolved(resolved)).toBe(want)
  })
})

describe('ytProxy', () => {
  it('直连时为空串（不读环境变量里的代理）', async () => {
    const resolve = vi.fn()
    expect(await net.ytProxy(cfg('direct', '127.0.0.1:7890'), resolve)).toBe('')
    expect(resolve).not.toHaveBeenCalled()
  })

  it('跟随系统：按 youtube.com 解析，支持 SOCKS', async () => {
    const resolve = vi.fn(async () => 'SOCKS5 127.0.0.1:7891')
    expect(await net.ytProxy(cfg('system'), resolve)).toBe('socks5://127.0.0.1:7891')
    expect(resolve).toHaveBeenCalledWith('https://www.youtube.com')
    expect(await net.ytProxy(cfg('system'), async () => 'DIRECT')).toBe('')
  })

  it('跟随系统且不注入时用默认会话解析', async () => {
    m.resolveProxy.mockResolvedValue('PROXY 10.0.0.1:3128')
    expect(await net.ytProxy(cfg('system'))).toBe('http://10.0.0.1:3128')
    expect(m.resolveProxy).toHaveBeenCalledWith('https://www.youtube.com')
  })

  it('手动：SOCKS 原样交给 yt-dlp，HTTP 规范化，填错时为空串', async () => {
    expect(await net.ytProxy(cfg('manual', ' socks5://127.0.0.1:7891 '))).toBe('socks5://127.0.0.1:7891')
    expect(await net.ytProxy(cfg('manual', 'socks5h://u:p@h:1080'))).toBe('socks5h://u:p@h:1080')
    expect(await net.ytProxy(cfg('manual', 'SOCKS4A://h:1080'))).toBe('SOCKS4A://h:1080')
    expect(await net.ytProxy(cfg('manual', 'socks://h:1080'))).toBe('socks://h:1080')
    expect(await net.ytProxy(cfg('manual', '127.0.0.1:7890'))).toBe('http://127.0.0.1:7890')
    expect(await net.ytProxy(cfg('manual', 'https://user:pw@proxy.local:443'))).toBe('https://user:pw@proxy.local:443')
    expect(await net.ytProxy(cfg('manual', 'http://127.0.0.1'))).toBe('')
    expect(await net.ytProxy(cfg('manual', 'ftp://h:21'))).toBe('')
    expect(await net.ytProxy(cfg('manual', ''))).toBe('')
  })
})
