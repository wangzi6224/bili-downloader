import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolResult, ToolSet } from './tools'

const getVersion = vi.hoisted(() => vi.fn(() => '0.0.0-test'))
vi.mock('electron', () => ({ app: { getVersion } }))
const { McpServer } = await import('./server')

async function freePort(): Promise<number> {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const { port } = s.address() as AddressInfo
  await new Promise<void>((r) => s.close(() => r()))
  return port
}

const PORT = await freePort()
const TOKEN = 'a'.repeat(48)

const deps: ToolSet = {
  definitions: [{ name: 'echo', title: '回显', description: '', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }],
  call: vi.fn(async (name: string, args: Record<string, unknown>): Promise<ToolResult> => ({
    content: [{ type: 'text', text: JSON.stringify({ name, args }) }]
  }))
}

const server = new McpServer(deps)

interface Reply {
  status: number
  body: any
}

/** 用 node:http 发请求，这样 Host 之类的头也能随意改 */
function send(
  opts: { method?: string; path?: string; port?: number; headers?: Record<string, string | undefined>; body?: string } = {}
): Promise<Reply> {
  const port = opts.port ?? PORT
  const headers: Record<string, string> = {}
  const all = { host: `127.0.0.1:${port}`, authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...opts.headers }
  for (const [k, v] of Object.entries(all)) if (v !== undefined) headers[k] = v
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method: opts.method ?? 'POST', path: opts.path ?? '/mcp', headers },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => resolve({ status: res.statusCode!, body: raw ? JSON.parse(raw) : undefined }))
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.end(opts.body)
  })
}

const rpc = (body: unknown, headers?: Record<string, string | undefined>) => send({ body: JSON.stringify(body), headers })

const callTool = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } })
  return r.body.result as { content: { type: string; text: string }[]; isError?: boolean }
}

beforeAll(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  await server.apply({ enabled: true, port: PORT, token: TOKEN })
})
afterAll(() => server.stop())

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('McpServer', () => {
  it('rejects missing tokens and foreign origins', async () => {
    expect((await rpc({}, { authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await rpc({}, { origin: 'https://evil.example' })).status).toBe(401)
  })

  it('initializes and lists tools', async () => {
    const init = (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })).body
    expect(init.result.protocolVersion).toBe('2025-03-26')
    expect(init.result.serverInfo).toEqual({ name: 'bili-downloader', version: '0.0.0-test' })
    expect(init.result.instructions).toContain('download_batch')
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    const list = (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).body
    expect(list.result.tools).toEqual(deps.definitions)
  })

  it('tools/call 把工具名和参数转给工具，参数不是对象时当作空对象', async () => {
    expect(JSON.parse((await callTool('echo', { a: 1 })).content[0].text)).toEqual({ name: 'echo', args: { a: 1 } })
    for (const args of [null, [1], 'x']) {
      await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'echo', arguments: args } })
      expect(deps.call).toHaveBeenLastCalledWith('echo', {})
    }
    await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call' })
    expect(deps.call).toHaveBeenLastCalledWith('undefined', {})
  })

  it('returns method-not-found for unknown methods', async () => {
    const r = (await rpc({ jsonrpc: '2.0', id: 4, method: 'nope' })).body
    expect(r).toEqual({ jsonrpc: '2.0', id: 4, error: { code: -32601, message: 'Method not found: nope' } })
  })
})

describe('生命周期', () => {
  it('启动前不在运行', () => {
    expect(new McpServer(deps).status()).toEqual({ running: false, error: undefined })
  })

  it('重复 apply 同样的配置不重启', async () => {
    const port = await freePort()
    const s = new McpServer(deps)
    try {
      await s.apply({ enabled: true, port, token: TOKEN })
      const stop = vi.spyOn(s, 'stop')
      await s.apply({ enabled: true, port, token: TOKEN })
      expect(stop).not.toHaveBeenCalled()
      expect(s.status().running).toBe(true)
      expect((await send({ port, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) })).status).toBe(200)
    } finally {
      await s.stop()
    }
  })

  it('enabled 为 false 时停止，再 apply 一次也不会启动', async () => {
    const port = await freePort()
    const s = new McpServer(deps)
    await s.apply({ enabled: true, port, token: TOKEN })
    await s.apply({ enabled: false, port, token: TOKEN })
    expect(s.status().running).toBe(false)
    await expect(send({ port, body: '{}' })).rejects.toThrow()
    const stop = vi.spyOn(s, 'stop')
    await s.apply({ enabled: false, port, token: TOKEN })
    expect(stop).not.toHaveBeenCalled()
  })

  it('换端口时重启到新端口', async () => {
    const [a, b] = [await freePort(), await freePort()]
    const s = new McpServer(deps)
    try {
      await s.apply({ enabled: true, port: a, token: TOKEN })
      await s.apply({ enabled: true, port: b, token: TOKEN })
      await expect(send({ port: a, body: '{}' })).rejects.toThrow()
      expect((await send({ port: b, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) })).status).toBe(200)
    } finally {
      await s.stop()
    }
  })

  it('端口被占用时报错，端口空出来后同样的配置可以重新启动', async () => {
    const port = await freePort()
    const blocker: Server = createServer()
    await new Promise<void>((r) => blocker.listen(port, '127.0.0.1', r))
    const s = new McpServer(deps)
    try {
      await s.apply({ enabled: true, port, token: TOKEN })
      expect(s.status()).toEqual({ running: false, error: `端口 ${port} 已被占用` })
      await new Promise<void>((r) => blocker.close(() => r()))
      await s.apply({ enabled: true, port, token: TOKEN })
      expect(s.status()).toEqual({ running: true, error: undefined })
    } finally {
      await s.stop()
      if (blocker.listening) blocker.close()
    }
  })
})

describe('认证', () => {
  const ping = { jsonrpc: '2.0', id: 1, method: 'ping' }

  it('Host 必须是本机地址加当前端口，localhost 也可以', async () => {
    expect((await rpc(ping, { host: `localhost:${PORT}` })).status).toBe(200)
    expect((await rpc(ping, { host: 'evil.example' })).status).toBe(401)
    expect((await rpc(ping, { host: `127.0.0.1:${PORT + 1}` })).status).toBe(401)
    expect((await rpc(ping, { host: '127.0.0.1' })).status).toBe(401)
  })

  it('Origin 只接受本机地址，可以带端口', async () => {
    expect((await rpc(ping, { origin: 'http://localhost:5173' })).status).toBe(200)
    expect((await rpc(ping, { origin: 'https://127.0.0.1' })).status).toBe(200)
    expect((await rpc(ping, { origin: 'http://127.0.0.1.evil.example' })).status).toBe(401)
    expect((await rpc(ping, { origin: 'null' })).status).toBe(401)
  })

  it('Bearer 不区分大小写；缺少令牌或长度不同都拒绝', async () => {
    expect((await rpc(ping, { authorization: `bearer ${TOKEN}` })).status).toBe(200)
    expect((await rpc(ping, { authorization: undefined })).status).toBe(401)
    expect((await rpc(ping, { authorization: `Bearer ${TOKEN}x` })).status).toBe(401)
    expect((await rpc(ping, { authorization: 'Bearer a' })).status).toBe(401)
  })

  it('令牌为空时一律拒绝（不能靠两个空串相等放行）', async () => {
    const port = await freePort()
    const s = new McpServer(deps)
    try {
      await s.apply({ enabled: true, port, token: '' })
      const body = JSON.stringify(ping)
      expect((await send({ port, body, headers: { authorization: undefined } })).status).toBe(401)
      expect((await send({ port, body, headers: { authorization: 'Bearer ' } })).status).toBe(401)
      expect((await send({ port, body, headers: { authorization: '' } })).status).toBe(401)
    } finally {
      await s.stop()
    }
  })
})

describe('HTTP 状态', () => {
  it('没通过认证时，路径不对也先返回 401', async () => {
    expect((await send({ path: '/nope', headers: { authorization: undefined } })).status).toBe(401)
    expect((await send({ path: '/nope' })).body).toEqual({ error: 'not found' })
    expect((await send({ path: '/nope' })).status).toBe(404)
  })

  it('只接受 POST', async () => {
    const r = await send({ method: 'GET' })
    expect(r).toEqual({ status: 405, body: { error: 'method not allowed' } })
  })

  it('请求体超过 1MB 返回 413', async () => {
    const r = await send({ body: 'x'.repeat(1024 * 1024 + 1) })
    expect(r).toEqual({ status: 413, body: { error: 'body too large' } })
  })

  it('不是 JSON 时返回 400 和 Parse error', async () => {
    const r = await send({ body: '{oops' })
    expect(r).toEqual({ status: 400, body: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } } })
  })

  it('批量请求按顺序返回，通知没有回复', async () => {
    const r = await rpc([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 'b', method: 'nope' }
    ])
    expect(r.status).toBe(200)
    expect(r.body).toEqual([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 'b', error: { code: -32601, message: 'Method not found: nope' } }
    ])
  })

  it('全是通知的批量请求返回 202', async () => {
    const r = await rpc([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', method: 'notifications/cancelled' }
    ])
    expect(r).toEqual({ status: 202, body: undefined })
  })

  it('请求体是 null 或其他非对象时返回 Invalid Request，不会挂住', async () => {
    const invalid = { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
    expect(await rpc(null)).toEqual({ status: 200, body: invalid })
    expect(await rpc(5)).toEqual({ status: 200, body: invalid })
    expect(await rpc('ping')).toEqual({ status: 200, body: invalid })
    expect(await rpc([null, { jsonrpc: '2.0', id: 1, method: 'ping' }, []])).toEqual({
      status: 200,
      body: [invalid, { jsonrpc: '2.0', id: 1, result: {} }, invalid]
    })
  })

  it('处理请求时意外出错也会回 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(server as unknown as { dispatch: () => Promise<unknown> }, 'dispatch').mockRejectedValueOnce(new Error('boom'))
    expect(await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' })).toEqual({ status: 500, body: { error: 'internal error' } })
    expect(console.error).toHaveBeenCalledWith('MCP 请求处理失败', expect.any(Error))
  })

  it('响应头已经发出后出错就断开连接', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(server as unknown as { reply: (res: { writeHead: (n: number) => void }) => void }, 'reply').mockImplementationOnce(
      (res) => {
        res.writeHead(200)
        throw new Error('boom')
      }
    )
    await expect(rpc({ jsonrpc: '2.0', id: 1, method: 'ping' })).rejects.toThrow()
  })
})

describe('JSON-RPC 方法', () => {
  it('不认识的协议版本回退到 2025-06-18', async () => {
    const a = (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).body
    expect(a.result.protocolVersion).toBe('2025-06-18')
    const b = (await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize' })).body
    expect(b.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} } })
  })

  it('ping 返回空对象，id 原样带回', async () => {
    expect((await rpc({ jsonrpc: '2.0', id: 'abc', method: 'ping' })).body).toEqual({ jsonrpc: '2.0', id: 'abc', result: {} })
    expect((await rpc({ jsonrpc: '2.0', id: null, method: 'ping' })).body).toEqual({ jsonrpc: '2.0', id: null, result: {} })
  })

  it('方法内部出错时返回 -32603', async () => {
    getVersion.mockImplementationOnce(() => {
      throw new Error('no version')
    })
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' })).body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32603, message: 'no version' }
    })
    getVersion.mockImplementationOnce(() => {
      throw 'raw'
    })
    expect((await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize' })).body.error).toEqual({ code: -32603, message: 'raw' })
  })
})

describe('和真实的工具一起', () => {
  it('通过 HTTP 走完解析、批量下载、查看进度、批量暂停', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { DEFAULT_OPTIONS } = await import('@shared/options')
    const { FakeQueue, mediaItem } = await import('../../test/fakeQueue')
    const { McpTools } = await import('./tools')
    const dir = mkdtempSync(join(tmpdir(), 'mcp-e2e-'))
    const queue = new FakeQueue()
    // 188 个视频的合集
    const items = Array.from({ length: 188 }, (_, i) => mediaItem(`ugc:BV${i + 1}:${i + 1}`, { index: i + 1, title: `第${i + 1}集` }))
    const tools = new McpTools({
      parseAll: async () => ({
        result: { kind: 'ugc', title: '合集', cover: '', groups: [{ id: 'g', title: 'g', items }], defaultSelected: [], paging: { total: 188 } as never },
        complete: true
      }),
      expandLazy: async (x) => x,
      queue,
      batchFile: join(dir, 'batches.json'),
      downloadedKeys: () => ['ugc:BV1:1'],
      settings: () => ({ downloadDir: join(dir, 'dl'), defaultQn: 80, defaults: DEFAULT_OPTIONS }) as never,
      updateSettings: (p) => p as never,
      authState: async () => ({ loggedIn: false })
    })
    const port = await freePort()
    const s = new McpServer(tools)
    const callAt = async (name: string, args: Record<string, unknown>) => {
      const r = await send({ port, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })
      return r.body.result as { structuredContent: any; content: { text: string }[]; isError?: boolean }
    }
    try {
      await s.apply({ enabled: true, port, token: TOKEN })
      const list = await send({ port, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
      expect(list.body.result.tools.map((t: { name: string }) => t.name)).toContain('download_batch')

      const parsed = (await callAt('parse_link', { url: 'https://space.bilibili.com/1/lists/2?type=season', limit: 200 })).structuredContent
      expect(parsed).toMatchObject({ total: 188, fetched: 188, complete: true, next_offset: null, counts: { downloaded: 1 } })
      expect(parsed.items).toHaveLength(188)

      const sub = (await callAt('download_batch', { url: 'https://space.bilibili.com/1/lists/2?type=season', all: true })).structuredContent
      expect(sub).toMatchObject({ selected: 187, skipped: { downloaded: 1 } })
      const again = (await callAt('download_batch', { url: 'https://space.bilibili.com/1/lists/2?type=season', all: true })).structuredContent
      expect(again).toMatchObject({ batch_id: sub.batch_id, deduplicated: true })
      expect(queue.list()).toHaveLength(187)

      const status = await callAt('get_batch_status', { batch_id: sub.batch_id })
      expect(JSON.parse(status.content[0].text)).toEqual(status.structuredContent)
      expect(status.structuredContent).toMatchObject({ state: 'queued', counts: { total: 187, queued: 187 } })

      const paused = (await callAt('control_tasks', { action: 'pause', batch_id: sub.batch_id })).structuredContent
      expect(paused).toMatchObject({ matched: 187, affected: 187 })
      const page = (await callAt('list_tasks', { batch_id: sub.batch_id, status: 'paused', offset: 150, limit: 100 })).structuredContent
      expect(page).toMatchObject({ total: 187, next_offset: null })
      expect(page.tasks).toHaveLength(37)
      expect((await callAt('get_status', {})).structuredContent.hints.join()).toContain('没有登录')
    } finally {
      await s.stop()
      tools.batches.flush()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
