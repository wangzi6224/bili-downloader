import { createWriteStream, existsSync, renameSync, rmSync, statSync } from 'node:fs'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import { readJson, writeJson } from '../store'
import { BASE_HEADERS } from '../bili/http'

export interface FetchFileOptions {
  urls: string[]
  dest: string
  /** 流的指纹（清晰度/编码/码率）；与已有 .part 不一致时丢弃重下 */
  fingerprint: string
  signal: AbortSignal
  /** 已下载字节数、总字节数（未知时为 0） */
  onProgress: (done: number, total: number) => void
}

interface PartMeta {
  fingerprint: string
  total: number
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 流式下载到 dest.part，支持 Range 断点续传，依次尝试备用地址 */
export async function fetchFile(o: FetchFileOptions): Promise<void> {
  if (existsSync(o.dest)) return
  const part = `${o.dest}.part`
  const metaFile = `${o.dest}.meta.json`
  const meta = readJson<PartMeta>(metaFile)
  if (meta?.fingerprint !== o.fingerprint) rmSync(part, { force: true })

  let lastErr: unknown
  for (const url of o.urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fetchOnce(url, part, metaFile, o)
        renameSync(part, o.dest)
        rmSync(metaFile, { force: true })
        return
      } catch (e) {
        if (o.signal.aborted) throw e
        lastErr = e
        await sleep(1000 * (attempt + 1))
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function fetchOnce(url: string, part: string, metaFile: string, o: FetchFileOptions): Promise<void> {
  const have = existsSync(part) ? statSync(part).size : 0
  const res = await fetch(url, {
    headers: { ...BASE_HEADERS, ...(have ? { Range: `bytes=${have}-` } : {}) },
    signal: o.signal
  })

  if (res.status === 416 && have > 0) {
    // 服务器认为已经下完
    const meta = readJson<PartMeta>(metaFile)
    if (meta && meta.total === have) return
    rmSync(part, { force: true })
    throw new Error('续传位置无效，重新下载')
  }
  if (!res.ok || !res.body) throw new Error(`下载失败（HTTP ${res.status}）`)

  const resumed = res.status === 206 && have > 0
  const start = resumed ? have : 0
  const range = res.headers.get('content-range')?.match(/\/(\d+)$/)
  const total = range ? Number(range[1]) : start + Number(res.headers.get('content-length') ?? 0)
  writeJson(metaFile, { fingerprint: o.fingerprint, total } satisfies PartMeta)

  let done = start
  o.onProgress(done, total)
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      done += chunk.length
      o.onProgress(done, total)
      cb(null, chunk)
    }
  })
  await pipeline(
    Readable.fromWeb(res.body as ReadableStream<Uint8Array>),
    counter,
    createWriteStream(part, { flags: resumed ? 'a' : 'w' }),
    { signal: o.signal }
  )
  if (total && done !== total) throw new Error(`文件不完整（${done}/${total}）`)
}
