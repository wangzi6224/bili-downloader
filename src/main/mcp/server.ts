import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { app } from 'electron'
import type { McpSettings } from '@shared/types'
import type { ToolSet } from './tools'

/**
 * 本地 MCP 服务（Streamable HTTP，只返回 JSON）。让 AI 客户端解析链接、批量下载、查看进度。
 * 只监听 127.0.0.1，必须带 Bearer 令牌，并校验 Host / Origin 以防 DNS 重绑定。
 */

/** initialize 时告诉客户端推荐的调用流程 */
const INSTRUCTIONS = [
  'B站下载器的本地服务，用来解析 B站链接、批量下载并跟踪进度。推荐流程：',
  '1. get_status 确认登录状态和队列；',
  '2. parse_link 查看链接里的条目（合集、收藏夹等会自动翻页，条目 id 稳定，可分段读取）；',
  '3. download_batch 一次提交，返回 batch_id；已下载的默认跳过，批次没结束时重复提交会返回同一个批次；',
  '4. get_batch_status 带 wait_seconds 等待并查看进度；',
  '5. 有失败时 control_tasks action=retry batch_id=…。',
  '这个服务不会删除已经下载好的文件。'
].join('\n')

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BODY = 1024 * 1024

interface RpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export class McpServer {
  private server?: Server
  private config?: McpSettings
  private error?: string

  constructor(private tools: ToolSet) {}

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
            serverInfo: { name: 'bili-downloader', version: app.getVersion() },
            instructions: INSTRUCTIONS
          })
        }
        case 'ping':
          return ok({})
        case 'tools/list':
          return ok({ tools: this.tools.definitions })
        case 'tools/call': {
          const args = m.params?.arguments
          return ok(
            await this.tools.call(String(m.params?.name), args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {})
          )
        }
        default:
          return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } }
      }
    } catch (e) {
      return { jsonrpc: '2.0', id: m.id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } }
    }
  }
}
