import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { connect } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

/**
 * AI agent 和应用之间的 stdio 桥：agent 按 stdio MCP 启动它（用应用自己的可执行文件，ELECTRON_RUN_AS_NODE=1），
 * 它把每行 JSON-RPC 消息转发给应用的本地 HTTP MCP 服务，再把回复写回 stdout。
 * 端口和令牌每次从应用的 settings.json 现读，agent 的配置里不用写令牌，换令牌、改端口也不用重装。
 * 应用没开时在后台拉起它。这里只用 Node 自带模块，不能引用 electron。
 */

export interface McpConfig {
  enabled: boolean
  port: number
  token: string
}

export interface BridgeDeps {
  /** 应用的数据目录（settings.json 所在的目录） */
  userData: string
  /** 应用本体：macOS 是 .app，Windows 是 exe，Linux 是 AppImage 或可执行文件 */
  app: string
  /** 启动应用时额外带的参数（开发版的项目目录、自定义的 --user-data-dir） */
  appArgs?: string[]
  input: Readable
  output: Writable
  /** 后台启动应用；测试时换成假的 */
  launch?: (app: string, args: string[]) => void
  /** 等应用启动的最长时间 */
  launchTimeoutMs?: number
  /** 探测端口的间隔 */
  pollMs?: number
}

/** agent 看到的报错：中英文都写上，模型自己会转述给用户 */
export const MESSAGES = {
  disabled:
    'B站下载器的 MCP 服务已关闭，请让用户在 B站下载器 > 设置 > AI 助手 里打开“开启 MCP 服务”。' +
    ' / The MCP service of Bili Downloader (B站下载器) is turned off. Ask the user to turn on “Enable MCP server” in Settings > AI assistants.',
  notInstalled:
    '找不到 B站下载器的设置，应用可能已被卸载或还没打开过。请让用户打开 B站下载器，在 设置 > AI 助手 里重新安装。' +
    ' / Bili Downloader (B站下载器) settings were not found. Ask the user to open the app and reinstall from Settings > AI assistants.',
  launchFailed:
    'B站下载器没有在运行，后台启动也没有成功。请让用户手动打开 B站下载器后再试。' +
    ' / Bili Downloader (B站下载器) is not running and could not be started. Ask the user to open it and try again.',
  unauthorized:
    'B站下载器拒绝了访问（令牌不匹配），请让用户重启 B站下载器后再试。' +
    ' / Bili Downloader (B站下载器) rejected the request (token mismatch). Ask the user to restart the app.'
}

/** 应用写的 mcp-manifest.json：应用没开时据此代答，不用为了列工具把应用拉起来 */
export interface Manifest {
  protocols: string[]
  serverInfo: { name: string; version: string }
  instructions: string
  tools: unknown[]
}

export function readManifest(userData: string): Manifest | undefined {
  try {
    const m = JSON.parse(readFileSync(join(userData, 'mcp-manifest.json'), 'utf8'))
    return Array.isArray(m?.protocols) && m.protocols.length && Array.isArray(m.tools) ? m : undefined
  } catch {
    return undefined
  }
}

/** 应用没开时能直接回答的请求；其他的（主要是 tools/call）才需要把应用拉起来 */
function answerOffline(msg: unknown, manifest: Manifest | undefined): unknown {
  if (!manifest || !msg || typeof msg !== 'object' || Array.isArray(msg)) return undefined
  const m = msg as { id?: Id; method?: string; params?: { protocolVersion?: unknown } }
  if (m.id === undefined) return undefined
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result })
  switch (m.method) {
    case 'initialize': {
      const asked = String(m.params?.protocolVersion ?? '')
      return ok({
        protocolVersion: manifest.protocols.includes(asked) ? asked : manifest.protocols[0],
        capabilities: { tools: {} },
        serverInfo: manifest.serverInfo,
        instructions: manifest.instructions
      })
    }
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: manifest.tools })
    default:
      return undefined
  }
}

export function readMcpConfig(userData: string): McpConfig | undefined {
  try {
    const mcp = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))?.mcp
    if (!mcp || typeof mcp.port !== 'number' || typeof mcp.token !== 'string') return undefined
    return { enabled: mcp.enabled === true, port: mcp.port, token: mcp.token }
  } catch {
    return undefined
  }
}

/**
 * 后台启动应用。macOS 用 open -n：同一个 .app 可能正以别的数据目录运行着（例如隔离的测试实例），不加 -n 只会把它切到前台。
 * 去掉让 Electron 当 Node 运行的变量；AppImage 运行时设的变量指向本进程的挂载目录，也不能带过去 */
export function launchApp(app: string, extra: string[] = [], platform: NodeJS.Platform = process.platform): void {
  const env = { ...process.env }
  for (const k of ['ELECTRON_RUN_AS_NODE', 'APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k]
  const appArgs = [...extra, '--background']
  const [cmd, args] = platform === 'darwin' && app.endsWith('.app') ? ['open', ['-n', '-g', '-a', app, '--args', ...appArgs]] : [app, appArgs]
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', env, windowsHide: true })
  child.on('error', () => {})
  child.unref()
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

interface HttpReply {
  status: number
  body: string
}

class Refused extends Error {}

function post(cfg: McpConfig, body: string, headers: Record<string, string>): Promise<HttpReply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: cfg.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${cfg.token}`,
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => (data += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
        res.on('error', reject)
      }
    )
    req.on('error', (e: NodeJS.ErrnoException) => reject(e.code === 'ECONNREFUSED' ? new Refused(e.message) : e))
    req.end(body)
  })
}

type Id = string | number | null

/** 请求里带 id 的才需要回复；批量消息里每个请求都要 */
function requestIds(msg: unknown): Id[] {
  const list = Array.isArray(msg) ? msg : [msg]
  return list.flatMap((m) => (m && typeof m === 'object' && 'id' in m && (m as { id?: unknown }).id !== undefined ? [(m as { id: Id }).id] : []))
}

const rpcError = (id: Id, message: string, code = -32000) => ({ jsonrpc: '2.0', id, error: { code, message } })

export class Bridge {
  private launching?: Promise<boolean>
  private protocol?: string
  /** initialize 还没回来时，后面的消息等它：要带上协商好的协议版本 */
  private initializing?: Promise<void>
  private pending = new Set<Promise<void>>()

  constructor(private deps: BridgeDeps) {}

  /** 读完 stdin 并等所有回复写完后结束 */
  async run(): Promise<void> {
    const rl = createInterface({ input: this.deps.input, crlfDelay: Infinity })
    for await (const line of rl) {
      if (!line.trim()) continue
      // 多个请求可以同时在途：get_batch_status 会带 wait_seconds 长时间等待
      const p = this.handle(line).finally(() => this.pending.delete(p))
      if (/"method"\s*:\s*"initialize"/.test(line)) this.initializing = p
      this.pending.add(p)
    }
    await Promise.all(this.pending)
  }

  private write(msg: unknown): void {
    this.deps.output.write(`${JSON.stringify(msg)}\n`)
  }

  async handle(line: string): Promise<void> {
    let msg: unknown
    try {
      msg = JSON.parse(line)
    } catch {
      return this.write(rpcError(null, 'Parse error', -32700))
    }
    const ids = requestIds(msg)
    const fail = (message: string): void => {
      if (!ids.length) return
      const errors = ids.map((id) => rpcError(id, message))
      this.write(Array.isArray(msg) ? errors : errors[0])
    }
    // 记下协商好的协议版本，之后的请求按规范带上
    const init = !Array.isArray(msg) && (msg as { method?: string })?.method === 'initialize'
    if (!init) await this.initializing
    try {
      const reply = await this.forward(line, msg, ids.length > 0)
      if (reply.status === 202 || !reply.body) return
      if (reply.status === 401) return fail(MESSAGES.unauthorized)
      let body: unknown
      try {
        body = JSON.parse(reply.body)
      } catch {
        return fail(`HTTP ${reply.status}`)
      }
      if (init) {
        const v = (body as { result?: { protocolVersion?: unknown } })?.result?.protocolVersion
        if (typeof v === 'string') this.protocol = v
      }
      if (reply.status >= 400 && !(body as { jsonrpc?: unknown })?.jsonrpc) return fail(`HTTP ${reply.status}`)
      this.write(body)
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  private async forward(line: string, msg: unknown, expectsReply: boolean): Promise<HttpReply> {
    const cfg = readMcpConfig(this.deps.userData)
    if (!cfg) throw new Error(MESSAGES.notInstalled)
    if (!cfg.enabled) throw new Error(MESSAGES.disabled)
    const headers: Record<string, string> = this.protocol ? { 'MCP-Protocol-Version': this.protocol } : {}
    try {
      return await post(cfg, line, headers)
    } catch (e) {
      if (!(e instanceof Refused)) throw e
    }
    // 应用没开：agent 启动时的握手、列工具和通知不必拉起应用，调用工具时才拉
    if (!expectsReply) return { status: 202, body: '' }
    const offline = answerOffline(msg, readManifest(this.deps.userData))
    if (offline) return { status: 200, body: JSON.stringify(offline) }
    if (!(await this.ensureRunning(cfg.port))) throw new Error(MESSAGES.launchFailed)
    // 应用启动时可能改过端口或令牌（例如第一次启动才生成令牌），重新读一次
    const next = readMcpConfig(this.deps.userData) ?? cfg
    return post(next, line, headers)
  }

  /** 同时有多个请求碰上应用没开时只启动一次 */
  private ensureRunning(port: number): Promise<boolean> {
    this.launching ??= this.startApp(port).finally(() => (this.launching = undefined))
    return this.launching
  }

  private async startApp(port: number): Promise<boolean> {
    const { launch = launchApp, launchTimeoutMs = 20_000, pollMs = 300 } = this.deps
    try {
      launch(this.deps.app, this.deps.appArgs ?? [])
    } catch {
      return false
    }
    const deadline = Date.now() + launchTimeoutMs
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs))
      // 应用启动后可能改了端口，按设置里的最新值探测
      if (await portOpen(readMcpConfig(this.deps.userData)?.port ?? port)) return true
    }
    return false
  }
}

/** 命令行参数：--user-data <dir> --app <path> [--app-arg <参数>]… */
export function parseArgs(argv: string[]): { userData: string; app: string; appArgs: string[] } | undefined {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const userData = get('--user-data')
  const app = get('--app')
  const appArgs = argv.flatMap((a, i) => (a === '--app-arg' && i + 1 < argv.length ? [argv[i + 1]] : []))
  return userData && app ? { userData, app, appArgs } : undefined
}
