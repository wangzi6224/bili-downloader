import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiModelStatus } from '@shared/types'
import { inputShapes, lenField, varint } from './onnxPatch'

vi.mock('electron', () => ({ app: { getPath: () => join(tmpdir(), 'bili-ai-model-default') } }))
const h = vi.hoisted(() => ({ fetchFile: vi.fn() }))
vi.mock('../../download/fetchFile', () => ({ fetchFile: h.fetchFile }))

const { AiModel, MODEL, rankSources, sha256File } = await import('./model')

// 一个最小的“模型”：只有一个四维输入
const str = (no: number, s: string): Buffer[] => lenField(no, [Buffer.from(s)])
const dim = (d: number | string): Buffer[] => lenField(1, typeof d === 'number' ? [varint(8), varint(d)] : str(2, d))
const CONTENT = Buffer.concat(
  lenField(7, lenField(11, [...str(1, 'image'), ...lenField(2, lenField(1, [varint(8), varint(1), ...lenField(2, [1, 3, 512, 512].flatMap(dim))]))]))
)
const SPEC = {
  file: 'tiny.onnx',
  size: CONTENT.length,
  sha256: createHash('sha256').update(CONTENT).digest('hex'),
  sources: [
    { name: 'ModelScope', url: 'https://ms.example/tiny.onnx' },
    { name: 'HuggingFace', url: 'https://hf.example/tiny.onnx' }
  ]
}

/** 按 Range 返回对应长度的数据 */
const partial = (init: RequestInit | undefined, size = SPEC.size): Response => {
  const range = new Headers(init?.headers).get('range') ?? 'bytes=0-0'
  const end = Number(/bytes=0-(\d+)/.exec(range)![1])
  return new Response(new Uint8Array(end + 1), { status: 206, headers: { 'content-range': `bytes 0-${end}/${size}` } })
}

let dir: string
let reachable: Record<string, boolean>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bili-ai-model-'))
  reachable = { 'https://ms.example/tiny.onnx': false, 'https://hf.example/tiny.onnx': true }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => (reachable[url] ? partial(init) : new Response('nope', { status: 404 })))
  )
  h.fetchFile.mockReset().mockImplementation(async (o: { dest: string; onProgress: (d: number, t: number) => void }) => {
    o.onProgress(1, SPEC.size)
    o.onProgress(2, SPEC.size)
    o.onProgress(SPEC.size, SPEC.size)
    writeFileSync(o.dest, CONTENT)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

const statuses = (m: InstanceType<typeof AiModel>): AiModelStatus[] => {
  const list: AiModelStatus[] = []
  m.on('status', (s) => list.push(s))
  return list
}

describe('AiModel', () => {
  it('默认规格是 LaMa，默认放在用户数据目录', () => {
    expect(MODEL.size).toBe(208_044_816)
    expect(new AiModel().path).toBe(join(tmpdir(), 'bili-ai-model-default', 'models', 'lama_fp32.onnx'))
  })

  it('下载：只用连得上的地址，进度节流，校验通过后就绪', async () => {
    const m = new AiModel(dir, SPEC)
    expect(m.status()).toEqual({ state: 'missing', size: SPEC.size, disk: 0 })
    const list = statuses(m)
    await m.download({ threads: 20 })
    expect(h.fetchFile).toHaveBeenCalledWith(expect.objectContaining({ urls: ['https://hf.example/tiny.onnx'], threads: 8, fingerprint: SPEC.sha256 }))
    expect(list[1]).toEqual({ state: 'downloading', size: SPEC.size, done: 0, source: 'HuggingFace' })
    expect(m.ready()).toBe(true)
    expect(readFileSync(join(dir, 'tiny.onnx.sha256'), 'utf8')).toBe(SPEC.sha256)
    expect(list[0]).toEqual({ state: 'downloading', size: SPEC.size, done: 0 })
    // 1、2 字节的进度被节流掉了，下完的那次会报
    expect(list.filter((s) => s.state === 'downloading' && !s.verifying).map((s) => s.done)).toEqual([0, 0, SPEC.size])
    expect(list.at(-2)).toMatchObject({ verifying: true })
    expect(list.at(-1)).toEqual({ state: 'ready', size: SPEC.size, disk: SPEC.size + SPEC.sha256.length })
    expect(m.status().disk).toBe(SPEC.size + SPEC.sha256.length)
    // 再下载直接返回
    await m.download()
    expect(h.fetchFile).toHaveBeenCalledTimes(1)
    expect(new AiModel(dir, SPEC).status().state).toBe('ready')
  })

  it('同时点两次下载只下一次', async () => {
    const m = new AiModel(dir, SPEC)
    await Promise.all([m.download(), m.download()])
    expect(h.fetchFile).toHaveBeenCalledTimes(1)
  })

  it('校验不通过、连不上：状态里带原因', async () => {
    h.fetchFile.mockImplementationOnce(async (o: { dest: string }) => writeFileSync(o.dest, 'broken'))
    const m = new AiModel(dir, SPEC)
    await m.download()
    expect(m.status()).toMatchObject({ state: 'error', message: '下载的模型文件校验不通过，请重试' })
    expect(existsSync(join(dir, 'tiny.onnx.download'))).toBe(false)

    reachable = {}
    await m.download()
    expect(m.status().message).toBe('连不上模型的下载地址（ModelScope、HuggingFace），请检查网络或在设置里配置代理')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ENOTFOUND'))))
    await m.download()
    expect(m.status().state).toBe('error')
  })

  it('取消下载回到未下载', async () => {
    const m = new AiModel(dir, SPEC)
    h.fetchFile.mockImplementationOnce(
      (o: { signal: AbortSignal }) =>
        new Promise((_, reject) => o.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    )
    const p = m.download()
    await vi.waitFor(() => expect(h.fetchFile).toHaveBeenCalled())
    m.cancel()
    await p
    expect(m.status().state).toBe('missing')
    m.cancel()
  })

  it('取消发生在探测地址时', async () => {
    const m = new AiModel(dir, SPEC)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        m.cancel()
        return partial(init)
      })
    )
    await m.download()
    expect(m.status().state).toBe('missing')
    expect(h.fetchFile).not.toHaveBeenCalled()
  })

  it('删除：下载中的先停下，文件和缓存都删掉', async () => {
    const m = new AiModel(dir, SPEC)
    await m.download()
    await m.fixed(16, 32)
    expect(m.status().disk).toBeGreaterThan(SPEC.size * 2)
    await m.remove()
    expect(m.ready()).toBe(false)
    expect(readdirSync(dir)).toEqual([])
    expect(m.status().disk).toBe(0)
    expect(new AiModel(join(dir, 'nope'), SPEC).status().disk).toBe(0)
    expect(m.status().state).toBe('missing')

    h.fetchFile.mockImplementationOnce(
      (o: { signal: AbortSignal }) =>
        new Promise((_, reject) => o.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    )
    const p = m.download()
    await vi.waitFor(() => expect(h.fetchFile).toHaveBeenCalledTimes(2))
    await m.remove()
    await p
    expect(m.status().state).toBe('missing')
  })

  it('固定尺寸的模型：按尺寸缓存，只留最近用过的两个', async () => {
    const m = new AiModel(dir, SPEC)
    await expect(m.fixed(16, 32)).rejects.toThrow('还没有下载 AI 模型')
    await m.download()
    const a = await m.fixed(16, 32)
    expect(inputShapes(readFileSync(a))[0].dims).toEqual([1, 3, 16, 32])
    expect(await m.fixed(16, 32)).toBe(a)
    await new Promise((r) => setTimeout(r, 5))
    await m.fixed(32, 32)
    await new Promise((r) => setTimeout(r, 5))
    await m.fixed(16, 32)
    await new Promise((r) => setTimeout(r, 5))
    await m.fixed(48, 32)
    const cached = readdirSync(join(dir, 'cache')).filter((f) => f.endsWith('.onnx')).sort()
    expect(cached).toEqual(['lama-16x32.onnx', 'lama-48x32.onnx'])
    // .used 记录坏了也不影响
    writeFileSync(join(dir, 'cache', 'lama-16x32.onnx.used'), 'x')
    await m.fixed(64, 32)
    expect(readdirSync(join(dir, 'cache')).filter((f) => f.endsWith('.onnx')).length).toBe(2)
  })

  it('sha256File', async () => {
    const f = join(dir, 'x.bin')
    writeFileSync(f, 'abc')
    expect(await sha256File(f)).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})

describe('rankSources', () => {
  const sources = [
    { name: 'A', url: 'https://a.example/m' },
    { name: 'B', url: 'https://b.example/m' },
    { name: 'C', url: 'https://c.example/m' },
    { name: 'D', url: 'https://d.example/m' },
    { name: 'E', url: 'https://e.example/m' }
  ]
  const SIZE = 2 * 1024 * 1024

  it('按实测速度排序；连不上、不支持分段、大小不对、数据不够的去掉', async () => {
    let clock = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        // A 慢，B 快
        if (url.includes('a.example')) clock += 900
        if (url.includes('b.example')) clock += 100
        if (url.includes('c.example')) throw new Error('ENOTFOUND')
        if (url.includes('d.example')) return new Response('whole file', { status: 200 })
        if (url.includes('e.example')) return new Response(new Uint8Array(10), { status: 206, headers: { 'content-range': `bytes 0-524287/${SIZE}` } })
        return partial(init, SIZE)
      })
    )
    const order: string[] = []
    const now = (): number => clock
    const ranked = await rankSources(sources, SIZE, {}, new AbortController().signal, now)
    order.push(...ranked.map((x) => x.name))
    expect(order).toEqual(['B', 'A'])
    const wrongSize = await rankSources(sources.slice(0, 1), SIZE + 1, {}, new AbortController().signal)
    expect(wrongSize).toEqual([])
  })

  it('测速请求的范围不超过文件大小', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => partial(init, 100))
    vi.stubGlobal('fetch', f)
    expect(await rankSources(sources.slice(0, 1), 100, { 'User-Agent': 'x' }, new AbortController().signal)).toHaveLength(1)
    expect(new Headers(f.mock.calls[0][1]!.headers).get('range')).toBe('bytes=0-99')
  })
})
