import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnqueueRequest, MediaItem, ParseResult, Settings, TaskInfo, TaskStatus } from '@shared/types'

const getVersion = vi.hoisted(() => vi.fn(() => '0.0.0-test'))
vi.mock('electron', () => ({ app: { getVersion } }))
const { McpServer } = await import('./mcp')

async function freePort(): Promise<number> {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const { port } = s.address() as AddressInfo
  await new Promise<void>((r) => s.close(() => r()))
  return port
}

const PORT = await freePort()
const TOKEN = 'a'.repeat(48)

const item = (i: number, over: Partial<MediaItem> = {}): MediaItem => ({ key: `ugc:BV:${i}`, kind: 'ugc', title: `第${i}集`, index: i, cid: i, ...over })

const RESULT: ParseResult = {
  kind: 'ugc',
  title: '合集',
  cover: '',
  groups: [{ id: 'g', title: 'g', items: [1, 2, 3].map((i) => item(i)) }],
  defaultSelected: ['ugc:BV:2']
}

const SETTINGS = { defaultQn: 80, defaults: { output: 'full', codec: ['avc'] } } as unknown as Settings

const deps = {
  parse: vi.fn(async (_url: string): Promise<ParseResult> => RESULT),
  enqueue: vi.fn(async (_req: EnqueueRequest): Promise<string | undefined> => undefined),
  tasks: vi.fn((): TaskInfo[] => []),
  pause: vi.fn((_id: string) => {}),
  resume: vi.fn((_id: string) => {}),
  settings: vi.fn(() => SETTINGS)
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

const lastEnqueued = (): EnqueueRequest => deps.enqueue.mock.calls.at(-1)![0]

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
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    const list = (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).body
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(['parse_link', 'download', 'list_tasks', 'pause_task', 'resume_task'])
  })

  it('downloads the default item, chosen indexes, or everything', async () => {
    expect((await callTool('download', { url: 'x' })).content[0].text).toContain('已加入 1 个')
    expect(lastEnqueued().items.map((i) => i.index)).toEqual([2])
    expect(lastEnqueued().options.qn).toBe(80)
    await callTool('download', { url: 'x', indexes: [1, 3], qn: 120 })
    expect(lastEnqueued().items.map((i) => i.index)).toEqual([1, 3])
    expect(lastEnqueued().options.qn).toBe(120)
    await callTool('download', { url: 'x', all: true, output: 'audio' })
    expect(lastEnqueued().items).toHaveLength(3)
    expect(lastEnqueued().options.output).toBe('audio')
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

describe('工具', () => {
  it('parse_link 返回概要，条目最多 200 个', async () => {
    deps.parse.mockResolvedValueOnce({
      ...RESULT,
      owner: 'UP',
      paging: { total: 1000 } as ParseResult['paging'],
      groups: [
        { id: 'a', title: 'a', items: Array.from({ length: 150 }, (_, i) => item(i + 1, { duration: 60 })) },
        { id: 'b', title: 'b', items: Array.from({ length: 100 }, (_, i) => item(i + 151, { unavailable: '已失效' })) }
      ]
    })
    const r = await callTool('parse_link', { url: 'https://b23.tv/x' })
    expect(deps.parse).toHaveBeenCalledWith('https://b23.tv/x')
    const data = JSON.parse(r.content[0].text)
    expect(data).toMatchObject({ title: '合集', kind: 'ugc', owner: 'UP', total: 1000, loaded: 250 })
    expect(data.items).toHaveLength(200)
    expect(data.items[0]).toEqual({ index: 1, title: '第1集', duration: 60 })
    expect(data.items[199]).toEqual({ index: 200, title: '第200集', unavailable: '已失效' })
  })

  it('parse_link 没有分页信息时 total 取已加载的条目数', async () => {
    const data = JSON.parse((await callTool('parse_link', {})).content[0].text)
    expect(deps.parse).toHaveBeenCalledWith('')
    expect(data).toMatchObject({ total: 3, loaded: 3 })
  })

  it('download 跳过失效的条目', async () => {
    deps.parse.mockResolvedValueOnce({
      ...RESULT,
      groups: [{ id: 'g', title: 'g', items: [item(1), item(2, { unavailable: '已失效' }), item(3)] }]
    })
    await callTool('download', { url: 'x', all: true })
    expect(lastEnqueued().items.map((i) => i.index)).toEqual([1, 3])
  })

  it('download 没有默认选中项时下载全部', async () => {
    deps.parse.mockResolvedValueOnce({ ...RESULT, defaultSelected: [] })
    await callTool('download', { url: 'x' })
    expect(lastEnqueued().items).toHaveLength(3)
  })

  it('download 的 indexes 一个都没命中时返回错误，不入队', async () => {
    const r = await callTool('download', { url: 'x', indexes: [7, 8] })
    expect(r).toEqual({ content: [{ type: 'text', text: '没有选中任何条目，请检查 indexes' }], isError: true })
    expect(deps.enqueue).not.toHaveBeenCalled()
  })

  it('download 的 output 不合法、qn 为 0 或不是数字时用默认设置', async () => {
    await callTool('download', { url: 'x', output: 'xyz', qn: 0 })
    expect(lastEnqueued().options).toEqual({ output: 'full', codec: ['avc'], qn: 80 })
    await callTool('download', { url: 'x', output: 'video', qn: 'abc' })
    expect(lastEnqueued().options).toMatchObject({ output: 'video', qn: 80 })
    expect(lastEnqueued()).toMatchObject({ title: '合集', kind: 'ugc', cover: '' })
  })

  it('download 把入队时的提示附在后面', async () => {
    deps.enqueue.mockResolvedValueOnce('跳过 2 个已下载的')
    expect((await callTool('download', { url: 'x' })).content[0].text).toBe('已加入 1 个下载任务：合集（跳过 2 个已下载的）')
  })

  it('解析出错时以 isError 返回', async () => {
    deps.parse.mockRejectedValueOnce(new Error('请先登录 B站账号'))
    expect(await callTool('download', { url: 'x' })).toEqual({ content: [{ type: 'text', text: '请先登录 B站账号' }], isError: true })
    deps.parse.mockRejectedValueOnce('boom')
    expect((await callTool('parse_link', { url: 'x' })).content[0].text).toBe('boom')
  })

  describe('list_tasks', () => {
    const task = (id: string, status: TaskStatus, downloaded = 0, total = 0) =>
      ({ id, title: id, groupTitle: 'g', status, downloaded, total, qualityLabel: '1080P', outputPath: `/x/${id}` }) as unknown as TaskInfo
    const ALL = [
      task('q', 'queued'),
      task('d', 'downloading', 1, 3),
      task('p', 'paused'),
      task('w', 'waitingAuth'),
      task('ok', 'done', 10, 10),
      task('e', 'error'),
      task('u', 'unsupported')
    ]
    const ids = async (status?: string) =>
      (JSON.parse((await callTool('list_tasks', status ? { status } : {})).content[0].text) as { id: string }[]).map((t) => t.id)

    beforeEach(() => {
      deps.tasks.mockReturnValue(ALL)
    })

    it('按状态过滤', async () => {
      expect(await ids()).toEqual(['q', 'd', 'p', 'w', 'ok', 'e', 'u'])
      expect(await ids('all')).toHaveLength(7)
      expect(await ids('active')).toEqual(['q', 'd', 'p', 'w'])
      expect(await ids('done')).toEqual(['ok'])
      expect(await ids('failed')).toEqual(['e', 'u'])
    })

    it('摘要里的进度取整，总量未知时为 0', async () => {
      const [d, ok, q] = ['d', 'ok', 'q'].map((id) => ALL.find((t) => t.id === id))
      deps.tasks.mockReturnValue([d!, ok!, q!])
      const list = JSON.parse((await callTool('list_tasks')).content[0].text)
      expect(list[0]).toEqual({ id: 'd', title: 'd', group: 'g', status: 'downloading', progress: 33, quality: '1080P', path: '/x/d' })
      expect(list.map((t: { progress: number }) => t.progress)).toEqual([33, 100, 0])
    })

    it('最多返回最近的 200 个', async () => {
      deps.tasks.mockReturnValue(Array.from({ length: 250 }, (_, i) => task(`t${i}`, 'done')))
      const list = await ids()
      expect(list).toHaveLength(200)
      expect(list[0]).toBe('t50')
      expect(list.at(-1)).toBe('t249')
    })
  })

  it('pause_task 和 resume_task 转发任务 id', async () => {
    expect((await callTool('pause_task', { id: 'abc' })).content[0].text).toBe('已暂停')
    expect(deps.pause).toHaveBeenCalledWith('abc')
    expect((await callTool('resume_task', { id: 42 })).content[0].text).toBe('已继续')
    expect(deps.resume).toHaveBeenCalledWith('42')
  })

  it('没有这个工具时返回错误', async () => {
    expect(await callTool('rm_rf')).toEqual({ content: [{ type: 'text', text: '没有这个工具：rm_rf' }], isError: true })
    const r = (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call' })).body
    expect(r.result).toEqual({ content: [{ type: 'text', text: '没有这个工具：undefined' }], isError: true })
  })
})
