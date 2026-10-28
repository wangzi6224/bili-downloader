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
