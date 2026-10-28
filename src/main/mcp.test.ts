import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EnqueueRequest, ParseResult, Settings } from '@shared/types'

vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0-test' } }))
const { McpServer } = await import('./mcp')

const PORT = 39000 + Math.floor(Math.random() * 500)
const TOKEN = 'a'.repeat(48)
const enqueued: EnqueueRequest[] = []

const RESULT: ParseResult = {
  kind: 'ugc',
  title: '合集',
  cover: '',
  groups: [
    {
      id: 'g',
      title: 'g',
      items: [1, 2, 3].map((i) => ({ key: `ugc:BV:${i}`, kind: 'ugc' as const, title: `第${i}集`, index: i, cid: i }))
    }
  ],
  defaultSelected: ['ugc:BV:2']
}

const server = new McpServer({
  parse: async () => RESULT,
  enqueue: async (req) => {
    enqueued.push(req)
    return undefined
  },
  tasks: () => [],
  pause: () => {},
  resume: () => {},
  settings: () => ({ defaultQn: 80, defaults: { output: 'full' } }) as unknown as Settings
})

const call = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`http://127.0.0.1:${PORT}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...headers },
    body: JSON.stringify(body)
  })

beforeAll(async () => {
  await server.apply({ enabled: true, port: PORT, token: TOKEN })
})
afterAll(() => server.stop())

describe('McpServer', () => {
  it('rejects missing tokens and foreign origins', async () => {
    expect((await call({}, { Authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await call({}, { Origin: 'https://evil.example' })).status).toBe(401)
  })

  it('initializes and lists tools', async () => {
    const init = await (await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })).json()
    expect(init.result.protocolVersion).toBe('2025-03-26')
    expect(init.result.serverInfo.name).toBe('bili-downloader')
    expect((await call({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    const list = await (await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(['parse_link', 'download', 'list_tasks', 'pause_task', 'resume_task'])
  })

  it('downloads the default item, chosen indexes, or everything', async () => {
    const dl = async (args: Record<string, unknown>) =>
      (await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'download', arguments: { url: 'x', ...args } } })).json()
    expect((await dl({})).result.content[0].text).toContain('已加入 1 个')
    expect(enqueued.at(-1)!.items.map((i) => i.index)).toEqual([2])
    expect(enqueued.at(-1)!.options.qn).toBe(80)
    await dl({ indexes: [1, 3], qn: 120 })
    expect(enqueued.at(-1)!.items.map((i) => i.index)).toEqual([1, 3])
    expect(enqueued.at(-1)!.options.qn).toBe(120)
    await dl({ all: true, output: 'audio' })
    expect(enqueued.at(-1)!.items).toHaveLength(3)
    expect(enqueued.at(-1)!.options.output).toBe('audio')
  })

  it('returns method-not-found for unknown methods', async () => {
    const r = await (await call({ jsonrpc: '2.0', id: 4, method: 'nope' })).json()
    expect(r.error.code).toBe(-32601)
  })
})
