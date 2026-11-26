import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '@shared/types'
import type { FetchFileOptions } from '../fetchFile'
import type { DriverContext } from './types'

vi.mock('../fetchFile', () => ({ fetchFile: vi.fn() }))
const { fetchFile } = await import('../fetchFile')
const { AbortError, DiskError, DownloadError } = await import('../errors')
const { fetchParts } = await import('./direct')

let tmp = ''
let threads = 4
let ac: AbortController
let progress: [number, number][]
const ctx = (): DriverContext => ({
  tmp,
  signal: ac.signal,
  settings: () => ({ threads }) as Settings,
  withAccount: (fn) => fn(),
  onPlanned: vi.fn(),
  onProgress: (d, t) => progress.push([d, t])
})
const part = (name: string, estimate = 100) => ({ name, urls: [`https://cdn/${name}`], fingerprint: name, estimate })
const write = async (o: FetchFileOptions): Promise<void> => {
  o.onProgress(1, 7)
  writeFileSync(o.dest, 'abc')
}

beforeEach(() => {
  tmp = join(mkdtempSync(join(tmpdir(), 'direct-')), 'task')
  threads = 4
  ac = new AbortController()
  progress = []
  vi.mocked(fetchFile).mockReset().mockImplementation(write)
})
afterEach(() => rmSync(join(tmp, '..'), { recursive: true, force: true }))

describe('fetchParts', () => {
  it('建好临时目录，全部一起下，返回路径；进度先用估算、再用真实大小', async () => {
    const paths = await fetchParts([part('a'), { ...part('b'), estimate: 50 }], ctx(), { headers: { Referer: 'r' } })
    expect(paths).toEqual([join(tmp, 'a'), join(tmp, 'b')])
    expect(vi.mocked(fetchFile).mock.calls[0][0]).toMatchObject({ fingerprint: 'a', threads: 4, headers: { Referer: 'r' } })
    expect(progress[0]).toEqual([1, 57])
    expect(progress.at(-1)).toEqual([6, 6])
  })

  it('真实大小未知时保留估算值', async () => {
    vi.mocked(fetchFile).mockImplementation(async (o) => {
      o.onProgress(2, 0)
      writeFileSync(o.dest, 'abc')
    })
    await fetchParts([part('a', 80)], ctx(), { headers: {} })
    expect(progress[0]).toEqual([2, 80])
  })

  it('已经下好的不重下', async () => {
    await fetchParts([part('a')], ctx(), { headers: {} })
    vi.mocked(fetchFile).mockClear()
    await fetchParts([part('a')], ctx(), { headers: {} })
    expect(fetchFile).not.toHaveBeenCalled()
  })

  it('限制同时下载的文件数', async () => {
    let running = 0
    let peak = 0
    vi.mocked(fetchFile).mockImplementation(async (o) => {
      peak = Math.max(peak, ++running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      writeFileSync(o.dest, 'x')
    })
    await fetchParts(['a', 'b', 'c', 'd', 'e'].map((n) => part(n)), ctx(), { headers: {}, concurrency: 2 })
    expect(peak).toBe(2)
    expect(fetchFile).toHaveBeenCalledTimes(5)
  })

  it('一个失败后不再开始新的', async () => {
    vi.mocked(fetchFile).mockRejectedValue(new DiskError('满了'))
    await expect(fetchParts(['a', 'b', 'c'].map((n) => part(n)), ctx(), { headers: {}, concurrency: 1 })).rejects.toThrow('满了')
    expect(fetchFile).toHaveBeenCalledTimes(1)
  })

  it('没有要下的文件', async () => {
    expect(await fetchParts([], ctx(), { headers: {} })).toEqual([])
  })

  it('分段下载失败时改单连接再试', async () => {
    vi.mocked(fetchFile).mockRejectedValueOnce(new DownloadError('断了'))
    await fetchParts([part('a')], ctx(), { headers: {}, singleFallback: true })
    expect(vi.mocked(fetchFile).mock.calls.map((c) => c[0].threads)).toEqual([4, 1])
  })

  it('没开单连接回退、本来就是单连接、或不是网络错误时直接抛出', async () => {
    vi.mocked(fetchFile).mockRejectedValue(new DownloadError('断了'))
    await expect(fetchParts([part('a')], ctx(), { headers: {} })).rejects.toThrow('断了')
    threads = 1
    await expect(fetchParts([part('b')], ctx(), { headers: {}, singleFallback: true })).rejects.toThrow('断了')
    threads = 4
    vi.mocked(fetchFile).mockRejectedValue(new DiskError('满了'))
    await expect(fetchParts([part('c')], ctx(), { headers: {}, singleFallback: true })).rejects.toThrow('满了')
    expect(fetchFile).toHaveBeenCalledTimes(3)
  })

  it('已经取消时不再回退重试', async () => {
    vi.mocked(fetchFile).mockImplementation(async () => {
      ac.abort()
      throw new DownloadError('断了')
    })
    await expect(fetchParts([part('a')], ctx(), { headers: {}, singleFallback: true })).rejects.toBeInstanceOf(AbortError)
    expect(fetchFile).toHaveBeenCalledTimes(1)
  })
})
