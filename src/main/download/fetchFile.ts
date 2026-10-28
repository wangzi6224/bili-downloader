import { existsSync, renameSync, rmSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { readJson, writeJson } from '../store'
import { AbortError, DiskError, DownloadError, toDiskError } from './errors'
import { limiter } from './rateLimiter'

export interface FetchFileOptions {
  urls: string[]
  dest: string
  /** 流的指纹（清晰度/编码/码率）；与已有 .part 不一致时丢弃重下 */
  fingerprint: string
  /** 分几段并行下载 */
  threads: number
  headers: Record<string, string>
  signal: AbortSignal
  /** 已下载字节数、总字节数 */
  onProgress: (done: number, total: number) => void
}

/** 闭区间 [start, end]，done 为已写入的字节数 */
export interface Segment {
  start: number
  end: number
  done: number
}

interface PartMeta {
  fingerprint: string
  total: number
  segments: Segment[]
}

/** 小于这个大小的分段没必要再拆 */
const MIN_SEGMENT = 2 * 1024 * 1024
const SEGMENT_RETRIES = 4

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function splitSegments(total: number, threads: number): Segment[] {
  const n = Math.max(1, Math.min(threads, Math.ceil(total / MIN_SEGMENT)))
  const size = Math.ceil(total / n)
  const out: Segment[] = []
  for (let start = 0; start < total; start += size) {
    out.push({ start, end: Math.min(total, start + size) - 1, done: 0 })
  }
  return out
}

/** 用 Range: bytes=0-0 取文件总大小 */
async function probeSize(o: FetchFileOptions): Promise<number> {
  let lastErr: unknown
  for (const url of o.urls) {
    try {
      const res = await fetch(url, { headers: { ...o.headers, Range: 'bytes=0-0' }, signal: o.signal })
      await res.body?.cancel()
      const total = Number(res.headers.get('content-range')?.match(/\/(\d+)$/)?.[1])
      if (res.status === 206 && total > 0) return total
      lastErr = new DownloadError(`获取文件大小失败（HTTP ${res.status}）`)
    } catch (e) {
      if (o.signal.aborted) throw new AbortError()
      lastErr = e
    }
  }
  throw lastErr instanceof DownloadError ? lastErr : new DownloadError(`连接下载服务器失败：${String(lastErr)}`)
}

async function fetchRange(
  url: string,
  seg: Segment,
  fh: FileHandle,
  o: FetchFileOptions,
  signal: AbortSignal,
  report: () => void
): Promise<void> {
  const from = seg.start + seg.done
  const res = await fetch(url, { headers: { ...o.headers, Range: `bytes=${from}-${seg.end}` }, signal })
  if (res.status !== 206 || !res.body) {
    await res.body?.cancel()
    throw new DownloadError(`下载失败（HTTP ${res.status}）`)
  }
  // 个别 CDN 节点会返回错误的区间，直接写入会导致花屏、音画不同步
  const m = res.headers.get('content-range')?.match(/bytes (\d+)-(\d+)\//)
  if (!m || Number(m[1]) !== from) {
    await res.body.cancel()
    throw new DownloadError('服务器返回的数据区间不对')
  }

  const reader = res.body.getReader()
  try {
    while (seg.start + seg.done <= seg.end) {
      const { done, value } = await reader.read()
      if (done) break
      await limiter.consume(value.length, signal)
      const remaining = seg.end + 1 - (seg.start + seg.done)
      const chunk = value.length > remaining ? value.subarray(0, remaining) : value
      try {
        await fh.write(chunk, 0, chunk.length, seg.start + seg.done)
      } catch (e) {
        throw toDiskError(e)
      }
      seg.done += chunk.length
      report()
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  if (seg.start + seg.done <= seg.end) throw new DownloadError('连接中断')
}

async function downloadSegment(
  seg: Segment,
  fh: FileHandle,
  o: FetchFileOptions,
  signal: AbortSignal,
  report: () => void
): Promise<void> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= SEGMENT_RETRIES; attempt++) {
    if (seg.start + seg.done > seg.end) return
    // 依次轮换主地址和备用地址
    const url = o.urls[attempt % o.urls.length]
    try {
      await fetchRange(url, seg, fh, o, signal, report)
      return
    } catch (e) {
      if (signal.aborted) throw new AbortError()
      if (e instanceof DiskError) throw e
      lastErr = e
      await sleep(1000 * 2 ** attempt)
    }
  }
  throw lastErr instanceof DownloadError ? lastErr : new DownloadError(String(lastErr))
}

/**
 * 分段并行下载到 dest.part（预分配大小、按偏移写入），完成后改名为 dest。
 * 进度按段保存在 dest.meta.json，中断后可以续传。
 */
export async function fetchFile(o: FetchFileOptions): Promise<void> {
  if (existsSync(o.dest)) return
  const part = `${o.dest}.part`
  const metaFile = `${o.dest}.meta.json`

  let meta = readJson<PartMeta>(metaFile)
  if (!meta || meta.fingerprint !== o.fingerprint || !Array.isArray(meta.segments) || !existsSync(part)) {
    rmSync(part, { force: true })
    const total = await probeSize(o)
    meta = { fingerprint: o.fingerprint, total, segments: splitSegments(total, o.threads) }
    try {
      const fh = await open(part, 'w')
      await fh.truncate(total)
      await fh.close()
    } catch (e) {
      throw toDiskError(e, part)
    }
    writeJson(metaFile, meta)
  }

  const m = meta
  const sum = (): number => m.segments.reduce((a, s) => a + s.done, 0)
  const report = (): void => o.onProgress(sum(), m.total)
  report()

  let fh: FileHandle
  try {
    fh = await open(part, 'r+')
  } catch (e) {
    throw toDiskError(e, part)
  }

  // 任何一段彻底失败就停掉其他段；用户暂停也通过它传递
  const inner = new AbortController()
  const onAbort = (): void => inner.abort()
  o.signal.addEventListener('abort', onAbort, { once: true })
  const saver = setInterval(() => writeJson(metaFile, m), 2000)
  let firstError: unknown
  try {
    await Promise.allSettled(
      m.segments.map((seg) =>
        downloadSegment(seg, fh, o, inner.signal, report).catch((e) => {
          if (!firstError && !(e instanceof AbortError)) firstError = e
          inner.abort()
        })
      )
    )
  } finally {
    clearInterval(saver)
    o.signal.removeEventListener('abort', onAbort)
    writeJson(metaFile, m)
    await fh.close()
  }

  if (o.signal.aborted) throw new AbortError()
  if (firstError) throw firstError
  if (sum() !== m.total) throw new DownloadError(`文件不完整（${sum()}/${m.total}）`)
  renameSync(part, o.dest)
  rmSync(metaFile, { force: true })
}
