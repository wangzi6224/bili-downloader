import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))
const { Bridge, launchApp, MESSAGES, parseArgs, readManifest, readMcpConfig } = await import('./bridge')

async function freePort(): Promise<number> {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const { port } = s.address() as AddressInfo
  await new Promise<void>((r) => s.close(() => r()))
  return port
}

type Handler = (req: IncomingMessage, body: string) => { status: number; body?: unknown; raw?: string; delay?: number }

let dir: string
let server: Server | undefined
let seen: { headers: IncomingMessage['headers']; body: string }[]

const writeSettings = (mcp: unknown): void => writeFileSync(join(dir, 'settings.json'), JSON.stringify({ mcp }))

async function listen(port: number, handler: Handler): Promise<void> {
  server = createServer(async (req, res) => {
    let body = ''
    for await (const c of req) body += c
    seen.push({ headers: req.headers, body })
    const r = handler(req, body)
    if (r.delay) await new Promise((ok) => setTimeout(ok, r.delay))
    res.writeHead(r.status, { 'Content-Type': 'application/json' })
    res.end(r.raw ?? (r.body === undefined ? undefined : JSON.stringify(r.body)))
  })
  await new Promise<void>((r) => server!.listen(port, '127.0.0.1', r))
}

/** 把几行消息喂给桥，读完后返回 stdout 里的每一行 */
async function run(lines: string[], opts: Partial<ConstructorParameters<typeof Bridge>[0]> = {}): Promise<any[]> {
  const input = new PassThrough()
  const output = new PassThrough()
  let out = ''
  output.on('data', (c) => (out += c))
  const done = new Bridge({ userData: dir, app: '/Apps/B站下载器.app', input, output, launch: () => {}, launchTimeoutMs: 300, pollMs: 20, ...opts }).run()
  for (const l of lines) input.write(`${l}\n`)
  input.end()
  await done
  return out.split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

const echo: Handler = (_req, body) => {
  const msg = JSON.parse(body)
  if (msg.id === undefined) return { status: 202 }
  return { status: 200, body: { jsonrpc: '2.0', id: msg.id, result: msg.method === 'initialize' ? { protocolVersion: '2025-06-18' } : { ok: msg.method } } }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bridge-'))
  seen = []
  spawnMock.mockReset()
})
afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()))
  server = undefined
  rmSync(dir, { recursive: true, force: true })
})

describe('readMcpConfig', () => {
  it('读出端口、令牌和开关；缺字段或文件坏了返回 undefined', () => {
    writeSettings({ enabled: true, port: 1234, token: 'tok' })
    expect(readMcpConfig(dir)).toEqual({ enabled: true, port: 1234, token: 'tok' })
    writeSettings({ port: 1234, token: 'tok' })
    expect(readMcpConfig(dir)?.enabled).toBe(false)
    writeSettings({ port: '1234', token: 'tok' })
    expect(readMcpConfig(dir)).toBeUndefined()
    writeFileSync(join(dir, 'settings.json'), '{}')
    expect(readMcpConfig(dir)).toBeUndefined()
    writeFileSync(join(dir, 'settings.json'), '{oops')
    expect(readMcpConfig(dir)).toBeUndefined()
  })
})

describe('parseArgs', () => {
  it('两个参数都要有', () => {
    expect(parseArgs(['--user-data', '/d', '--app', '/a'])).toEqual({ userData: '/d', app: '/a', appArgs: [] })
    expect(parseArgs(['--user-data', '/d', '--app', '/a', '--app-arg', '/proj', '--app-arg', '--user-data-dir=/d', '--app-arg'])?.appArgs).toEqual([
      '/proj',
      '--user-data-dir=/d'
    ])
    expect(parseArgs(['--user-data', '/d'])).toBeUndefined()
    expect(parseArgs([])).toBeUndefined()
  })
})

describe('launchApp', () => {
  const child = { on: vi.fn(), unref: vi.fn() }
  beforeEach(() => spawnMock.mockReturnValue(child))

  it('macOS 用 open -g 在后台打开 .app，不带 ELECTRON_RUN_AS_NODE 和 AppImage 的变量', () => {
    process.env.ELECTRON_RUN_AS_NODE = '1'
    process.env.APPIMAGE = '/x.AppImage'
    try {
      launchApp('/Applications/B站下载器.app', undefined, 'darwin')
    } finally {
      delete process.env.ELECTRON_RUN_AS_NODE
      delete process.env.APPIMAGE
    }
    const [cmd, args, opts] = spawnMock.mock.calls[0]
    expect(cmd).toBe('open')
    expect(args).toEqual(['-n', '-g', '-a', '/Applications/B站下载器.app', '--args', '--background'])
    expect(opts.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(opts.env.APPIMAGE).toBeUndefined()
    expect(opts).toMatchObject({ detached: true, stdio: 'ignore' })
    expect(child.unref).toHaveBeenCalled()
    // 启动失败的 error 事件要接住，不能让桥崩掉
    const onError = child.on.mock.calls.find(([e]) => e === 'error')![1]
    expect(() => onError(new Error('x'))).not.toThrow()
  })

  it('Windows、Linux 直接运行可执行文件', () => {
    launchApp('C:\\Programs\\B站下载器.exe', [], 'win32')
    expect(spawnMock.mock.calls[0].slice(0, 2)).toEqual(['C:\\Programs\\B站下载器.exe', ['--background']])
    launchApp('/opt/app/bili-downloader', ['--user-data-dir=/d'], 'linux')
    expect(spawnMock.mock.calls[1].slice(0, 2)).toEqual(['/opt/app/bili-downloader', ['--user-data-dir=/d', '--background']])
    // 开发版的 Electron.app 要带上项目目录
    launchApp('/x/Electron.app', ['/proj'], 'darwin')
    expect(spawnMock.mock.calls[2][1]).toEqual(['-n', '-g', '-a', '/x/Electron.app', '--args', '/proj', '--background'])
    launchApp('/x/electron')
    expect(spawnMock.mock.calls[3][0]).toBe('/x/electron')
  })
})

describe('Bridge', () => {
  it('转发请求并按行写回回复，通知不输出；之后的请求带上协商好的协议版本和令牌', async () => {
    const port = await freePort()
    writeSettings({ enabled: true, port, token: 'tok' })
    await listen(port, echo)
    const out = await run([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      '',
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    ])
    expect(out).toEqual([
      { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', id: 2, result: { ok: 'tools/list' } }
    ])
    expect(seen[0].headers.authorization).toBe('Bearer tok')
    expect(seen[0].headers['mcp-protocol-version']).toBeUndefined()
    expect(seen[2].headers['mcp-protocol-version']).toBe('2025-06-18')
  })

  it('多个请求同时在途，先回来的先写', async () => {
    const port = await freePort()
    writeSettings({ enabled: true, port, token: 'tok' })
    await listen(port, (req, body) => ({ ...echo(req, body), delay: JSON.parse(body).id === 1 ? 150 : 0 }))
    const out = await run([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'slow' }), JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'fast' })])
    expect(out.map((m) => m.id)).toEqual([2, 1])
  })

  it('无法解析的行回 Parse error', async () => {
    expect(await run(['{bad'])).toEqual([{ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }])
  })

  it('MCP 服务关闭、找不到设置时，每个请求都回带说明的错误，批量请求回数组', async () => {
    writeSettings({ enabled: false, port: 1, token: 'tok' })
    const out = await run([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      JSON.stringify([{ jsonrpc: '2.0', id: 2, method: 'ping' }, { jsonrpc: '2.0', method: 'n' }, null]),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
    ])
    expect(out).toEqual([
      { jsonrpc: '2.0', id: 1, error: { code: -32000, message: MESSAGES.disabled } },
      [{ jsonrpc: '2.0', id: 2, error: { code: -32000, message: MESSAGES.disabled } }]
    ])
    rmSync(join(dir, 'settings.json'))
    expect(await run([JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' })])).toEqual([
      { jsonrpc: '2.0', id: 3, error: { code: -32000, message: MESSAGES.notInstalled } }
    ])
  })

  it('401、非 JSON 的出错回复和 HTTP 错误都转成 JSON-RPC 错误；带 jsonrpc 的出错回复原样转发', async () => {
    const port = await freePort()
    writeSettings({ enabled: true, port, token: 'tok' })
    const replies: Record<number, ReturnType<Handler>> = {
      1: { status: 401, body: { error: 'unauthorized' } },
      2: { status: 500, raw: 'oops' },
      3: { status: 404, body: { error: 'not found' } },
      4: { status: 400, body: { jsonrpc: '2.0', id: 4, error: { code: -32700, message: 'Parse error' } } },
      5: { status: 200, raw: '' }
    }
    await listen(port, (_req, body) => replies[JSON.parse(body).id])
    const out = await run([1, 2, 3, 4, 5].map((id) => JSON.stringify({ jsonrpc: '2.0', id, method: 'x' })))
    const byId = Object.fromEntries(out.map((m) => [m.id, m.error.message]))
    expect(byId).toEqual({ 1: MESSAGES.unauthorized, 2: 'HTTP 500', 3: 'HTTP 404', 4: 'Parse error' })
  })

  it('应用没开时启动一次，等端口通了再转发；启动时改了端口也能跟上', async () => {
    const oldPort = await freePort()
    const port = await freePort()
    writeSettings({ enabled: true, port: oldPort, token: 'tok' })
    const launch = vi.fn(() => {
      setTimeout(() => {
        writeSettings({ enabled: true, port, token: 'new' })
        void listen(port, echo)
      }, 40)
    })
    const out = await run(
      [JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'a' }), JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'b' })],
      { launch, launchTimeoutMs: 2000 }
    )
    expect(launch).toHaveBeenCalledTimes(1)
    expect(launch).toHaveBeenCalledWith('/Apps/B站下载器.app', [])
    expect(out.map((m) => m.result.ok).sort()).toEqual(['a', 'b'])
    expect(seen.every((s) => s.headers.authorization === 'Bearer new')).toBe(true)
  })

  it('应用没开时，握手、列工具、ping 和通知用缓存代答，不拉起应用；调用工具才拉起', async () => {
    const port = await freePort()
    writeSettings({ enabled: true, port, token: 'tok' })
    const manifest = { protocols: ['2025-06-18', '2024-11-05'], serverInfo: { name: 'bili-downloader', version: '1.0.0' }, instructions: '说明', tools: [{ name: 'search_videos' }] }
    writeFileSync(join(dir, 'mcp-manifest.json'), JSON.stringify(manifest))
    const launch = vi.fn()
    const out = await run(
      [
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }),
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' })
      ],
      { launch }
    )
    expect(launch).not.toHaveBeenCalled()
    expect(out).toEqual([
      { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: manifest.serverInfo, instructions: '说明' } },
      { jsonrpc: '2.0', id: 2, result: { tools: manifest.tools } },
      { jsonrpc: '2.0', id: 3, result: {} }
    ])
    // 不认识的协议版本用最新的；批量请求和调用工具都要拉起应用
    const more = await run(
      [
        JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'initialize', params: {} }),
        JSON.stringify([{ jsonrpc: '2.0', id: 5, method: 'tools/list' }]),
        JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'search_videos' } })
      ],
      { launch }
    )
    expect(more[0].result.protocolVersion).toBe('2025-06-18')
    expect(launch).toHaveBeenCalledTimes(1)
    expect(more.slice(1).flat().map((m) => [m.id, m.error.message]).sort()).toEqual([
      [5, MESSAGES.launchFailed],
      [6, MESSAGES.launchFailed]
    ])
  })

  it('缓存文件缺字段或坏了就当作没有', () => {
    expect(readManifest(dir)).toBeUndefined()
    for (const bad of ['{oops', '{}', '{"protocols":[],"tools":[]}', '{"protocols":["x"]}']) {
      writeFileSync(join(dir, 'mcp-manifest.json'), bad)
      expect(readManifest(dir)).toBeUndefined()
    }
  })

  it('启动超时或启动出错时说明应用没能打开', async () => {
    const port = await freePort()
    writeSettings({ enabled: true, port, token: 'tok' })
    const timeout = await run([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'a' })], { launch: () => {} })
    expect(timeout[0].error.message).toBe(MESSAGES.launchFailed)
    const thrown = await run([JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'a' })], {
      launch: () => {
        throw new Error('spawn failed')
      }
    })
    expect(thrown[0].error.message).toBe(MESSAGES.launchFailed)
  })

  it('连接出了别的错（不是被拒绝）直接报错，不去启动应用', async () => {
    const port = await freePort()
    writeSettings({ enabled: true, port, token: 'tok' })
    server = createServer((req) => req.socket.destroy())
    await new Promise<void>((r) => server!.listen(port, '127.0.0.1', r))
    const launch = vi.fn()
    const out = await run([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'a' })], { launch })
    expect(out[0].error.message).toMatch(/socket hang up|ECONNRESET/)
    expect(launch).not.toHaveBeenCalled()
  })
})
