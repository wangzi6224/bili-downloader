import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AbortError, DiskError, DownloadError } from './errors'
import { fetchFile, splitLargest, splitSegments, type FetchFileOptions, type Segment } from './fetchFile'
import { limiter } from './rateLimiter'

const DATA = randomBytes(7 * 1024 * 1024 + 123)
let server: Server
let base = ''
let wrongRangeOnce = true
let dropFirstConnection = true
let hangFirstConnection = true
/** 收到的每个请求的 Range */
const ranges: string[] = []

/** 每 every 毫秒写 64KB；返回的函数把剩下的一次写完 */
function drip(res: ServerResponse, start: number, end: number, every: number): () => void {
  let pos = start
  const timer = setInterval(() => {
    const stop = Math.min(end + 1, pos + 64 * 1024)
    res.write(DATA.subarray(pos, stop))
    pos = stop
    if (pos > end) {
      clearInterval(timer)
      res.end()
    }
  }, every)
  res.on('close', () => clearInterval(timer))
  return () => {
    clearInterval(timer)
    res.end(DATA.subarray(pos, end + 1))
  }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    ranges.push(req.headers.range ?? '')
    const m = req.headers.range?.match(/bytes=(\d+)-(\d*)/)
    if (!m) {
      res.writeHead(200, { 'Content-Length': DATA.length })
      res.end(DATA)
      return
    }
    let start = Number(m[1])
    const end = m[2] ? Number(m[2]) : DATA.length - 1
    if (req.url === '/wrong-range' && wrongRangeOnce && start > 0) {
      // 模拟 CDN 返回错误区间
      wrongRangeOnce = false
      start = 0
    }
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${DATA.length}`,
      'Content-Length': end - start + 1
    })
    if (req.url === '/flaky' && dropFirstConnection && start > 0) {
      // 模拟连接中途断开
      dropFirstConnection = false
      res.write(DATA.subarray(start, start + 1000))
      res.destroy()
      return
    }
    if (req.url === '/hang' && hangFirstConnection && start > 0) {
      // 模拟连接没断、但不再来数据
      hangFirstConnection = false
      res.write(DATA.subarray(start, start + 1000))
      return
    }
    if (req.url === '/slow-head' && start === 0) {
      // 分到慢节点的连接；过一会儿再写完，免得用例要等它下完
      setTimeout(drip(res, start, end, 100), 800)
      return
    }
    if (req.url === '/fade-head' && start === 0) {
      // 一开始很快，之后不再来数据
      res.write(DATA.subarray(0, 1024 * 1024))
      setTimeout(() => res.end(DATA.subarray(1024 * 1024, end + 1)), 2500)
      return
    }
    if (req.url === '/steady' || req.url === '/slow-head' || req.url === '/fade-head') {
      drip(res, start, end, 10)
      return
    }
    res.end(DATA.subarray(start, end + 1))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

/**
 * fake timers 下推进重试退避，中间用真的 setImmediate 让网络和文件 IO 跑完。
 * 上限按真实时间算（Date 没有被 fake）：按次数算的话一轮很快，磁盘慢时等 IO 就把次数用完了，
 * 之后再也没人推进定时器，用例只能卡到超时
 */
async function drive<T>(p: Promise<T>): Promise<T> {
  let settled = false
  p.then(
    () => (settled = true),
    () => (settled = true)
  )
  const deadline = Date.now() + 4000
  while (!settled && Date.now() < deadline) {
    await vi.advanceTimersByTimeAsync(500)
    await new Promise((r) => setImmediate(r))
  }
  return p
}
const fakeTimers = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
}

function run(path: string, dest: string, threads = 4, signal = new AbortController().signal) {
  return fetchFile({
    urls: [`${base}${path}`],
    dest,
    fingerprint: 'fp',
    threads,
    headers: {},
    signal,
    onProgress: () => {}
  })
}

describe('splitSegments', () => {
  it('covers the whole file without gaps', () => {
    const segs = splitSegments(10 * 1024 * 1024 + 7, 4)
    expect(segs).toHaveLength(4)
    expect(segs[0].start).toBe(0)
    expect(segs[3].end).toBe(10 * 1024 * 1024 + 6)
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBe(segs[i - 1].end + 1)
  })

  it('does not split small files', () => {
    expect(splitSegments(1000, 8)).toHaveLength(1)
  })
})

describe('splitLargest', () => {
  const MB = 1024 * 1024
  const all = (): boolean => true

  it('从剩余部分的中点劈开剩余最多的段', () => {
    const segs = [
      { start: 0, end: 10 * MB - 1, done: 2 * MB },
      { start: 10 * MB, end: 15 * MB - 1, done: 0 }
    ]
    const seg = splitLargest(segs, all)
    expect(seg).toEqual({ start: 6 * MB, end: 10 * MB - 1, done: 0 })
    expect(segs[0]).toEqual({ start: 0, end: 6 * MB - 1, done: 2 * MB })
    expect(segs).toHaveLength(3)
    expect(segs[2]).toBe(seg)
  })

  it('跳过已完成的段', () => {
    const segs = [
      { start: 0, end: 20 * MB - 1, done: 20 * MB },
      { start: 20 * MB, end: 25 * MB - 1, done: 0 }
    ]
    expect(splitLargest(segs, all)).toEqual({ start: 20 * MB + Math.ceil(2.5 * MB), end: 25 * MB - 1, done: 0 })
    expect(segs[0].end).toBe(20 * MB - 1)
  })

  it('剩余不够拆成两个最小段时不拆', () => {
    const segs = [{ start: 0, end: 10 * MB - 1, done: 6 * MB + 1 }]
    expect(splitLargest(segs, all)).toBeUndefined()
    expect(segs).toEqual([{ start: 0, end: 10 * MB - 1, done: 6 * MB + 1 }])
    expect(splitLargest([], all)).toBeUndefined()
  })

  it('跳过不值得拆的段，拆剩下的里面最大的', () => {
    const fast = { start: 0, end: 20 * MB - 1, done: 0 }
    const slow = { start: 20 * MB, end: 26 * MB - 1, done: 0 }
    const worth = vi.fn((s: Segment) => s === slow)
    expect(splitLargest([fast, slow], worth)).toEqual({ start: 23 * MB, end: 26 * MB - 1, done: 0 })
    expect(worth).toHaveBeenCalledWith(fast, 20 * MB)
    expect(fast.end).toBe(20 * MB - 1)
    expect(slow.end).toBe(23 * MB - 1)
  })

  it('都不值得拆时不拆', () => {
    const segs = [{ start: 0, end: 20 * MB - 1, done: 0 }]
    expect(splitLargest(segs, () => false)).toBeUndefined()
    expect(segs).toEqual([{ start: 0, end: 20 * MB - 1, done: 0 }])
  })
})

describe('fetchFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fetchfile-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('downloads in parallel segments', async () => {
    const dest = join(dir, 'a.bin')
    await run('/ok', dest)
    expect(readFileSync(dest).equals(DATA)).toBe(true)
    expect(existsSync(`${dest}.meta.json`)).toBe(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recovers from a wrong content-range', async () => {
    const dest = join(dir, 'b.bin')
    fakeTimers()
    await drive(run('/wrong-range', dest))
    expect(readFileSync(dest).equals(DATA)).toBe(true)
  })

  it('resumes a dropped connection', async () => {
    const dest = join(dir, 'c.bin')
    fakeTimers()
    await drive(run('/flaky', dest))
    expect(readFileSync(dest).equals(DATA)).toBe(true)
  })

  it('resumes after being aborted', async () => {
    const dest = join(dir, 'd.bin')
    const ac = new AbortController()
    let aborted = false
    const p = fetchFile({
      urls: [`${base}/ok`],
      dest,
      fingerprint: 'fp',
      threads: 2,
      headers: {},
      signal: ac.signal,
      onProgress: (done) => {
        if (!aborted && done > 1024 * 1024) {
          aborted = true
          ac.abort()
        }
      }
    })
    await expect(p).rejects.toThrow('aborted')
    expect(existsSync(`${dest}.meta.json`)).toBe(true)
    await run('/ok', dest, 2)
    expect(readFileSync(dest).equals(DATA)).toBe(true)
  })

  /** 放好预分配的 .part 和进度，模拟上次按这些段下到一半 */
  function leftover(dest: string, segments: Segment[]): void {
    writeFileSync(`${dest}.part`, Buffer.alloc(DATA.length))
    writeFileSync(`${dest}.meta.json`, JSON.stringify({ fingerprint: 'fp', total: DATA.length, segments }))
    ranges.length = 0
  }

  it('续传时调大段数，空闲的连接拆开已有的段', async () => {
    const dest = join(dir, 'e.bin')
    const last = DATA.length - 1
    leftover(dest, [{ start: 0, end: last, done: 0 }])
    await run('/ok', dest, 4)
    expect(readFileSync(dest).equals(DATA)).toBe(true)
    // 剩下的两个连接拆不出不小于最小段的部分，不再发请求；两个请求到达的先后不定
    expect(ranges.sort()).toEqual([`bytes=0-${last}`, `bytes=${Math.ceil(DATA.length / 2)}-${last}`].sort())
  })

  it('续传时调小段数，多出来的段排队下载', async () => {
    const dest = join(dir, 'f.bin')
    leftover(dest, splitSegments(DATA.length, 4))
    await run('/ok', dest, 1)
    expect(readFileSync(dest).equals(DATA)).toBe(true)
    expect(ranges).toEqual(splitSegments(DATA.length, 4).map((s) => `bytes=${s.start}-${s.end}`))
  })

  /** 放好 [0, cut) 和 [cut, 结尾] 两段，用两个连接下载，返回第一段有没有被拆 */
  async function firstSegmentSplit(path: string, dest: string, cut: number): Promise<boolean> {
    leftover(dest, [
      { start: 0, end: cut - 1, done: 0 },
      { start: cut, end: DATA.length - 1, done: 0 }
    ])
    await run(path, dest, 2)
    expect(readFileSync(dest).equals(DATA)).toBe(true)
    const starts = ranges.map((r) => Number(r.match(/bytes=(\d+)-/)?.[1]))
    return starts.some((s) => s > 0 && s < cut)
  }

  it('先下完的连接分担慢连接剩下的部分', async () => {
    expect(await firstSegmentSplit('/slow-head', join(dir, 'g.bin'), 6 * 1024 * 1024)).toBe(true)
  })

  it('很快能下完的段不拆，不多发请求', async () => {
    const cut = 6.5 * 1024 * 1024
    expect(await firstSegmentSplit('/steady', join(dir, 'h.bin'), cut)).toBe(false)
    expect(ranges).toHaveLength(2)
  })

  it('当时不值得拆的段后来变慢了也会被拆', async () => {
    expect(await firstSegmentSplit('/fade-head', join(dir, 'i.bin'), 6 * 1024 * 1024)).toBe(true)
  })

  it('连接没断但不再来数据时断开重连', async () => {
    const dest = join(dir, 'j.bin')
    fakeTimers()
    await drive(run('/hang', dest))
    expect(readFileSync(dest).equals(DATA)).toBe(true)
  })
})

describe('fetchFile 的边界情况', () => {
  const SMALL = randomBytes(1000)
  const fetchMock = vi.fn<typeof fetch>()
  let dir = ''
  let dest = ''

  /** 按 Range 返回 SMALL 的一段 */
  function serve(init?: RequestInit): Response {
    const m = new Headers(init?.headers).get('range')?.match(/bytes=(\d+)-(\d+)/)
    if (!m) return new Response(new Uint8Array(SMALL))
    const start = Number(m[1])
    const end = Number(m[2])
    return new Response(new Uint8Array(SMALL.subarray(start, end + 1)), {
      status: 206,
      headers: { 'content-range': `bytes ${start}-${end}/${SMALL.length}` }
    })
  }

  const get = (urls: string[], over: Partial<FetchFileOptions> = {}): Promise<void> =>
    fetchFile({ urls, dest, fingerprint: 'fp', threads: 2, headers: {}, signal: new AbortController().signal, onProgress: () => {}, ...over })

  /** 先放好 .part 和进度，模拟上次下到一半 */
  const leftover = (meta: object | undefined, part = true): void => {
    if (part) writeFileSync(`${dest}.part`, Buffer.alloc(SMALL.length, 7))
    if (meta) writeFileSync(`${dest}.meta.json`, JSON.stringify(meta))
  }
  const finished = (fingerprint: string): object => ({
    fingerprint,
    total: SMALL.length,
    segments: [{ start: 0, end: SMALL.length - 1, done: SMALL.length }]
  })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fetchfile-edge-'))
    dest = join(dir, 'f.bin')
    fetchMock.mockReset().mockImplementation(async (_url, init) => serve(init))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    // limiter 是全局单例
    limiter.setLimit(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('目标文件已存在时直接返回', async () => {
    writeFileSync(dest, 'done')
    await get(['https://a/'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readFileSync(dest, 'utf8')).toBe('done')
  })

  it('探测大小失败时换备用地址，分段下载也轮换地址', async () => {
    fakeTimers()
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).startsWith('https://bad')) throw new TypeError('fetch failed')
      return serve(init)
    })
    await drive(get(['https://bad/', 'https://good/']))
    expect(readFileSync(dest).equals(SMALL)).toBe(true)
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(['https://bad/', 'https://good/', 'https://bad/', 'https://good/'])
    expect(existsSync(`${dest}.meta.json`)).toBe(false)
  })

  it('所有地址都连不上时报连接失败', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const e = await get(['https://a/', 'https://b/']).catch((err: unknown) => err)
    expect(e).toBeInstanceOf(DownloadError)
    expect((e as Error).message).toBe('连接下载服务器失败：TypeError: fetch failed')
  })

  it('所有地址都拿不到大小时报最后一个的 HTTP 状态', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response(null, { status: 206 }))
    await expect(get(['https://a/', 'https://b/'])).rejects.toThrow('获取文件大小失败（HTTP 206）')
  })

  it('探测时已经中止就报 AbortError', async () => {
    const ac = new AbortController()
    ac.abort()
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
      return serve(init)
    })
    await expect(get(['https://a/'], { signal: ac.signal })).rejects.toBeInstanceOf(AbortError)
  })

  it('进度和指纹都对上、.part 也在时直接用上次的结果', async () => {
    leftover(finished('fp'))
    await get(['https://a/'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readFileSync(dest)).toEqual(Buffer.alloc(SMALL.length, 7))
  })

  it.each<[string, object | undefined, boolean]>([
    ['指纹变了', finished('别的清晰度'), true],
    ['进度文件缺失', undefined, true],
    ['进度文件损坏', { fingerprint: 'fp', total: 1000, segments: 'x' }, true],
    ['.part 缺失', finished('fp'), false]
  ])('%s时从头下载', async (_, meta, part) => {
    leftover(meta, part)
    await get(['https://a/'])
    expect(readFileSync(dest).equals(SMALL)).toBe(true)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Range: 'bytes=0-0' })
  })

  it('进度里的分段对不上总大小时报文件不完整', async () => {
    leftover({ fingerprint: 'fp', total: 1000, segments: [{ start: 0, end: 499, done: 500 }] })
    await expect(get(['https://a/'])).rejects.toThrow('文件不完整（500/1000）')
    expect(existsSync(dest)).toBe(false)
  })

  it('目录不存在时报 DiskError', async () => {
    dest = join(dir, '已拔掉的磁盘', 'f.bin')
    const e = await get(['https://a/']).catch((err: unknown) => err)
    expect(e).toBeInstanceOf(DiskError)
    expect((e as Error).message).toBe(`下载目录不存在或外接磁盘已断开：${dest}.part`)
  })

  it('服务器不按 Range 返回 206 时重试 5 次后失败，保留进度以便续传', async () => {
    fakeTimers()
    fetchMock.mockImplementation(async (_url, init) =>
      new Headers(init?.headers).get('range') === 'bytes=0-0' ? serve(init) : new Response(new Uint8Array(SMALL))
    )
    const e = await drive(get(['https://a/'])).catch((err: unknown) => err)
    expect(e).toBeInstanceOf(DownloadError)
    expect((e as Error).message).toBe('下载失败（HTTP 200）')
    // 1 次探测 + 首次下载 + 4 次重试
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(`${dest}.meta.json`)).toBe(true)
  })

  it('服务器迟迟不响应时断开重连', async () => {
    fakeTimers()
    let ranged = 0
    fetchMock.mockImplementation((_url, init) => {
      if (new Headers(init?.headers).get('range') === 'bytes=0-0' || ++ranged > 1) return Promise.resolve(serve(init))
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    })
    await drive(get(['https://a/']))
    expect(readFileSync(dest).equals(SMALL)).toBe(true)
    expect(ranged).toBe(2)
  })

  it('限速等待的时间不算连接卡住', async () => {
    fakeTimers()
    // 1000 字节按每秒 10 字节要等 100 秒，比卡住的判定时间长
    limiter.setLimit(0.01)
    await drive(get(['https://a/']))
    expect(readFileSync(dest).equals(SMALL)).toBe(true)
    // 1 次探测 + 1 次下载，没有重连
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('限速等待中暂停能立即打断', async () => {
    limiter.setLimit(1)
    const ac = new AbortController()
    const p = get(['https://a/'], { signal: ac.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    ac.abort()
    await expect(p).rejects.toBeInstanceOf(AbortError)
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(`${dest}.meta.json`)).toBe(true)
  })
})
