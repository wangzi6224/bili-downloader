import { createServer, request, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { normalizeProxyUrl, parseResolvedProxy, setFetchProxy } from './proxy'

describe('normalizeProxyUrl', () => {
  it.each([
    ['127.0.0.1:7890', 'http://127.0.0.1:7890'],
    ['http://user:pa%40ss@proxy.local:8080', 'http://user:pa%40ss@proxy.local:8080'],
    ['https://p.example:443', 'https://p.example:443']
  ])('%s', (input, out) => {
    expect(normalizeProxyUrl(input)).toBe(out)
  })

  it('rejects socks and missing ports', () => {
    expect(() => normalizeProxyUrl('socks5://127.0.0.1:7891')).toThrow('SOCKS')
    expect(() => normalizeProxyUrl('http://127.0.0.1')).toThrow('端口')
    expect(() => normalizeProxyUrl('')).toThrow()
  })
})

describe('parseResolvedProxy', () => {
  it('reads the first entry', () => {
    expect(parseResolvedProxy('PROXY 127.0.0.1:7890; DIRECT')).toBe('http://127.0.0.1:7890')
    expect(parseResolvedProxy('DIRECT')).toBeUndefined()
    expect(() => parseResolvedProxy('SOCKS5 127.0.0.1:7891')).toThrow('SOCKS')
  })
})

describe('normalizeProxyUrl：其余情况', () => {
  it.each([
    // 用户显式写了默认端口时要保留
    ['http://proxy.local:80', 'http://proxy.local:80'],
    ['proxy.local:80', 'http://proxy.local:80'],
    ['http://u:p@proxy.local:80', 'http://u:p@proxy.local:80'],
    ['HTTP://Proxy.Local:3128', 'http://proxy.local:3128'],
    // IPv6
    ['[::1]:7890', 'http://[::1]:7890'],
    ['http://[2001:db8::1]:8080', 'http://[2001:db8::1]:8080'],
    // 路径和查询参数丢掉
    ['http://127.0.0.1:7890/some/path?x=1', 'http://127.0.0.1:7890'],
    ['  127.0.0.1:7890  ', 'http://127.0.0.1:7890'],
    // 只有用户名
    ['http://user@proxy.local:8080', 'http://user:@proxy.local:8080']
  ])('%s → %s', (input, out) => {
    expect(normalizeProxyUrl(input)).toBe(out)
  })

  it('不支持的协议、格式错误、凭据里的 :80 不算端口', () => {
    expect(() => normalizeProxyUrl('ftp://proxy.local:21')).toThrow('不支持的代理协议：ftp:')
    expect(() => normalizeProxyUrl('socks5h://127.0.0.1:1080')).toThrow('SOCKS')
    expect(() => normalizeProxyUrl('http://exa mple:80')).toThrow('代理地址格式不对：http://exa mple:80')
    expect(() => normalizeProxyUrl('http://[::1')).toThrow('代理地址格式不对')
    expect(() => normalizeProxyUrl('http://u:80@proxy.local')).toThrow('端口')
  })
})

describe('parseResolvedProxy：其余情况', () => {
  it('HTTPS 条目用 https，关键字不区分大小写', () => {
    expect(parseResolvedProxy('HTTPS proxy.corp:443; DIRECT')).toBe('https://proxy.corp:443')
    expect(parseResolvedProxy('proxy 10.0.0.1:3128')).toBe('http://10.0.0.1:3128')
  })

  it('只看第一条：DIRECT 在前时直连', () => {
    expect(parseResolvedProxy('DIRECT; PROXY 127.0.0.1:7890')).toBeUndefined()
    expect(parseResolvedProxy('')).toBeUndefined()
    expect(() => parseResolvedProxy('socks 127.0.0.1:1080; DIRECT')).toThrow('SOCKS')
  })
})

describe('setFetchProxy：状态文案', () => {
  afterAll(() => {
    setFetchProxy(undefined)
  })

  it('凭据打码', () => {
    expect(setFetchProxy('http://user:secret@127.0.0.1:1')).toBe('通过 http://***@127.0.0.1:1 连接')
    expect(setFetchProxy('https://127.0.0.1:2')).toBe('通过 https://127.0.0.1:2 连接')
  })
})

describe('setFetchProxy', () => {
  let target: Server
  let proxy: Server
  let targetUrl = ''
  let proxyUrl = ''
  let tunnelled = 0

  beforeAll(async () => {
    target = createServer((_req, res) => res.end('hello'))
    await new Promise<void>((r) => target.listen(0, '127.0.0.1', r))
    targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}/`

    // 最小的 HTTP 代理：CONNECT 隧道 + 绝对地址转发
    proxy = createServer((req, res) => {
      tunnelled++
      const up = request(req.url!, { method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode!, r.headers)
        r.pipe(res)
      })
      req.pipe(up)
    })
    proxy.on('connect', (req, socket, head) => {
      tunnelled++
      const [host, port] = req.url!.split(':')
      const up = connect(Number(port), host, () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        up.write(head)
        up.pipe(socket)
        socket.pipe(up)
      })
    })
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r))
    proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
  })

  afterAll(() => {
    setFetchProxy(undefined)
    target.close()
    proxy.close()
  })

  it('routes global fetch through the proxy and back to direct', async () => {
    expect(setFetchProxy(proxyUrl)).toContain('通过')
    expect(await (await fetch(targetUrl)).text()).toBe('hello')
    expect(tunnelled).toBeGreaterThan(0)

    const before = tunnelled
    expect(setFetchProxy(undefined)).toBe('直连')
    expect(await (await fetch(targetUrl)).text()).toBe('hello')
    expect(tunnelled).toBe(before)
  })
})
