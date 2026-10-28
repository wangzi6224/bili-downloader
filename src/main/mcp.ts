import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { app } from 'electron'
import type { EnqueueRequest, McpSettings, OutputKind, ParseResult, Settings, TaskInfo } from '@shared/types'

/**
 * 本地 MCP 服务（Streamable HTTP，只返回 JSON）。让 AI 客户端解析链接、创建下载、查看进度。
 * 只监听 127.0.0.1，必须带 Bearer 令牌，并校验 Host / Origin 以防 DNS 重绑定。
 */

export interface McpDeps {
  parse: (url: string) => Promise<ParseResult>
  enqueue: (req: EnqueueRequest) => Promise<string | undefined>
  tasks: () => TaskInfo[]
  pause: (id: string) => void
  resume: (id: string) => void
  settings: () => Settings
}

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BODY = 1024 * 1024

interface RpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const TOOLS = [
  {
    name: 'parse_link',
    description: '解析 B站链接（视频、合集、番剧、课程、收藏夹、UP 主空间等），返回标题和条目列表',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'B站链接或 BV 号' } }, required: ['url'] }
  },
  {
    name: 'download',
    description: '把链接里的内容加入下载队列。不指定 indexes 时下载链接对应的默认条目；all 为 true 时下载已解析出的全部条目',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        indexes: { type: 'array', items: { type: 'integer' }, description: '要下载的条目序号（parse_link 返回的 index）' },
        all: { type: 'boolean' },
        qn: { type: 'integer', description: '清晰度代码：127 最高、120 4K、116 1080P60、80 1080P、64 720P、32 480P' },
        output: { type: 'string', enum: ['full', 'audio', 'video'], description: '完整视频 / 仅音频 / 仅视频' }
      },
      required: ['url']
    }
  },
  {
    name: 'list_tasks',
    description: '查看下载队列',
    inputSchema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['all', 'active', 'done', 'failed'] } }
    }
  },
  {
    name: 'pause_task',
    description: '暂停下载任务',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'resume_task',
    description: '继续或重试下载任务',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  }
]

const text = (value: unknown, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {})
})

function summarizeTask(t: TaskInfo) {
  return {
    id: t.id,
    title: t.title,
    group: t.groupTitle,
    status: t.status,
    progress: t.total ? Math.round((t.downloaded / t.total) * 100) : 0,
    quality: t.qualityLabel,
    error: t.error,
    path: t.outputPath
  }
}

export class McpServer {
  private server?: Server
  private config?: McpSettings
  private error?: string

  constructor(private deps: McpDeps) {}

  status(): { running: boolean; error?: string } {
    return { running: Boolean(this.server?.listening), error: this.error }
  }

  async apply(cfg: McpSettings): Promise<void> {
    if (this.config && JSON.stringify(this.config) === JSON.stringify(cfg) && (cfg.enabled ? this.server : !this.server)) return
    this.config = { ...cfg }
    await this.stop()
    this.error = undefined
    if (!cfg.enabled) return
    const server = createServer((req, res) => {
      this.handle(req, res, cfg).catch((e) => {
        // 兜底：每个请求都要有响应，否则客户端会一直挂着
        console.error('MCP 请求处理失败', e)
        if (res.headersSent) res.destroy()
        else this.reply(res, 500, { error: 'internal error' })
      })
    })
    await new Promise<void>((resolve) => {
      server.once('error', (e: NodeJS.ErrnoException) => {
        this.error = e.code === 'EADDRINUSE' ? `端口 ${cfg.port} 已被占用` : e.message
        resolve()
      })
      server.listen(cfg.port, '127.0.0.1', () => {
        this.server = server
        console.info(`MCP 服务已启动：http://127.0.0.1:${cfg.port}/mcp`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    const s = this.server
    this.server = undefined
    if (s) await new Promise<void>((r) => s.close(() => r()))
  }

  private reply(res: ServerResponse, status: number, body?: unknown): void {
    // 先序列化：序列化失败时响应头还没发出，兜底还能回 500
    const data = body === undefined ? undefined : JSON.stringify(body)
    res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' })
    res.end(data)
  }

  private authorized(req: IncomingMessage, cfg: McpSettings): boolean {
    // 令牌为空时两个空 buffer 会被判为相等，必须直接拒绝
    if (!cfg.token) return false
    const host = req.headers.host ?? ''
    if (host !== `127.0.0.1:${cfg.port}` && host !== `localhost:${cfg.port}`) return false
    const origin = req.headers.origin
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return false
    const got = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
    const want = Buffer.from(cfg.token)
    return got.length === want.length && timingSafeEqual(got, want)
  }

  private async handle(req: IncomingMessage, res: ServerResponse, cfg: McpSettings): Promise<void> {
    if (!this.authorized(req, cfg)) return this.reply(res, 401, { error: 'unauthorized' })
    if (req.url !== '/mcp') return this.reply(res, 404, { error: 'not found' })
    if (req.method !== 'POST') return this.reply(res, 405, { error: 'method not allowed' })

    let raw = ''
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > MAX_BODY) return this.reply(res, 413, { error: 'body too large' })
    }
    let msg: RpcRequest | RpcRequest[]
    try {
      msg = JSON.parse(raw)
    } catch {
      return this.reply(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
    const list = Array.isArray(msg) ? msg : [msg]
    const out = (await Promise.all(list.map((m) => this.dispatch(m)))).filter(Boolean)
    if (!out.length) return this.reply(res, 202)
    this.reply(res, 200, Array.isArray(msg) ? out : out[0])
  }

  private async dispatch(m: RpcRequest): Promise<unknown> {
    // null、数字、数组之类的不是请求对象
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
    }
    // 没有 id 的是通知，不需要回复
    if (m.id === undefined) return undefined
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result })
    try {
      switch (m.method) {
        case 'initialize': {
          const asked = String(m.params?.protocolVersion ?? '')
          return ok({
            protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
            capabilities: { tools: {} },
            serverInfo: { name: 'bili-downloader', version: app.getVersion() }
          })
        }
        case 'ping':
          return ok({})
        case 'tools/list':
          return ok({ tools: TOOLS })
        case 'tools/call':
          return ok(await this.callTool(String(m.params?.name), (m.params?.arguments ?? {}) as Record<string, unknown>))
        default:
          return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } }
      }
    } catch (e) {
      return { jsonrpc: '2.0', id: m.id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } }
    }
  }

  private async callTool(name: string, args: Record<string, unknown>) {
    const d = this.deps
    try {
      switch (name) {
        case 'parse_link': {
          const r = await d.parse(String(args.url ?? ''))
          const items = r.groups.flatMap((g) => g.items)
          return text({
            title: r.title,
            kind: r.kind,
            owner: r.owner,
            total: r.paging?.total ?? items.length,
            loaded: items.length,
            items: items.slice(0, 200).map((i) => ({ index: i.index, title: i.title, duration: i.duration, unavailable: i.unavailable }))
          })
        }
        case 'download': {
          const r = await d.parse(String(args.url ?? ''))
          const items = r.groups.flatMap((g) => g.items).filter((i) => !i.unavailable)
          const wanted = Array.isArray(args.indexes) ? new Set((args.indexes as unknown[]).map(Number)) : undefined
          const chosen = wanted
            ? items.filter((i) => wanted.has(i.index))
            : args.all
              ? items
              : r.defaultSelected.length
                ? items.filter((i) => r.defaultSelected.includes(i.key))
                : items
          if (!chosen.length) return text('没有选中任何条目，请检查 indexes', true)
          const s = d.settings()
          const output = (['full', 'audio', 'video'].includes(String(args.output)) ? args.output : s.defaults.output) as OutputKind
          const note = await d.enqueue({
            title: r.title,
            cover: r.cover,
            kind: r.kind,
            meta: r.meta,
            items: chosen,
            options: { ...s.defaults, qn: Number(args.qn) || s.defaultQn, output }
          })
          return text(`已加入 ${chosen.length} 个下载任务：${r.title}${note ? `（${note}）` : ''}`)
        }
        case 'list_tasks': {
          const filter = String(args.status ?? 'all')
          const active = new Set(['queued', 'fetching', 'downloading', 'merging', 'extras', 'paused', 'waitingAuth'])
          const tasks = d
            .tasks()
            .filter((t) =>
              filter === 'active' ? active.has(t.status) : filter === 'done' ? t.status === 'done' : filter === 'failed' ? ['error', 'unsupported'].includes(t.status) : true
            )
          return text(tasks.slice(-200).map(summarizeTask))
        }
        case 'pause_task':
          d.pause(String(args.id))
          return text('已暂停')
        case 'resume_task':
          d.resume(String(args.id))
          return text('已继续')
        default:
          return text(`没有这个工具：${name}`, true)
      }
    } catch (e) {
      return text(e instanceof Error ? e.message : String(e), true)
    }
  }
}
