import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchFile, splitSegments } from './fetchFile'

const DATA = randomBytes(7 * 1024 * 1024 + 123)
let server: Server
let base = ''
let wrongRangeOnce = true
let dropFirstConnection = true

beforeAll(async () => {
  server = createServer((req, res) => {
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
    res.end(DATA.subarray(start, end + 1))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

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

describe('fetchFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fetchfile-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('downloads in parallel segments', async () => {
    const dest = join(dir, 'a.bin')
    await run('/ok', dest)
    expect(readFileSync(dest).equals(DATA)).toBe(true)
    expect(existsSync(`${dest}.meta.json`)).toBe(false)
  })

  it('recovers from a wrong content-range', async () => {
    const dest = join(dir, 'b.bin')
    await run('/wrong-range', dest)
    expect(readFileSync(dest).equals(DATA)).toBe(true)
  })

  it('resumes a dropped connection', async () => {
    const dest = join(dir, 'c.bin')
    await run('/flaky', dest)
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
})
