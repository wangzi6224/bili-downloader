import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WM_NOTE } from '@shared/watermark'
import type { ProcessingInfo } from '@shared/types'
import type { DashStream } from '../bili/playurl'
import { AbortError, FfmpegError } from '../download/errors'
import type { Encoder } from './encoder'
import type { MediaProbe, ProbeVideo } from './probe'

vi.mock('./probe', () => ({ probeMedia: vi.fn() }))
vi.mock('./locate', () => ({ locateWatermark: vi.fn() }))
vi.mock('./transcode', () => ({ encodeWithFallback: vi.fn() }))
vi.mock('./encoder', () => ({ targetKbps: vi.fn(() => 6000) }))
vi.mock('./delogo', () => ({ buildVideoOnlyArgs: vi.fn(() => ['args']) }))
vi.mock('./detect', () => ({ AUTO_MIN_SCORE: 0.6 }))

const { probeMedia } = await import('./probe')
const { locateWatermark } = await import('./locate')
const { encodeWithFallback } = await import('./transcode')
const { targetKbps } = await import('./encoder')
const { buildVideoOnlyArgs } = await import('./delogo')
const { autoDelogo } = await import('./auto')

const V: ProbeVideo = { index: 0, codec: 'h264', width: 1920, height: 1080, rotation: 0, fps: 30, hdr: false, dolbyVision: false }
const R = { x: 1668, y: 18, w: 234, h: 72 }
const HEVC: Encoder = { name: 'hevc_videotoolbox', codec: 'hevc', hw: true }
const stream = (over: Partial<DashStream> = {}): DashStream => ({ id: 80, codecid: 7, codecs: 'avc1.640032', bandwidth: 4_000_000, ...over })

let tmp = ''
let source = ''
let stages: ProcessingInfo[]
let ac: AbortController
const run = (over: Partial<Parameters<typeof autoDelogo>[0]> = {}) =>
  autoDelogo({ tmp, source, stream: stream(), durationHint: 50, signal: ac.signal, onStage: (p) => stages.push(p), ...over })

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'auto-'))
  source = join(tmp, 'video.m4s')
  writeFileSync(source, 'source video')
  stages = []
  ac = new AbortController()
  vi.mocked(probeMedia).mockReset().mockResolvedValue({ duration: 100, video: V, streams: [] } as MediaProbe)
  vi.mocked(locateWatermark).mockReset().mockResolvedValue({ result: { score: 0.8, box: { x: 0, y: 0, w: 1, h: 1 } }, region: R })
  vi.mocked(targetKbps).mockClear()
  vi.mocked(buildVideoOnlyArgs).mockClear()
  vi.mocked(encodeWithFallback)
    .mockReset()
    .mockImplementation(async (job) => {
      job.build(HEVC)
      writeFileSync(join(tmp, 'video.wm.part'), 'clean')
      return HEVC
    })
})

afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('跳过', () => {
  it.each([
    ['HDR 清晰度', stream({ id: 125 })],
    ['杜比视界清晰度', stream({ id: 126 })],
    ['杜比视界编码', stream({ codecs: 'dvh1.08.07' })]
  ])('%s：不读文件直接跳过', async (_name, s) => {
    expect(await run({ stream: s })).toEqual({ note: WM_NOTE.hdr })
    expect(probeMedia).not.toHaveBeenCalled()
  })

  it('读出来是 HDR 或杜比视界', async () => {
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: { ...V, hdr: true }, streams: [] })
    expect(await run()).toEqual({ note: WM_NOTE.hdr })
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: { ...V, dolbyVision: true }, streams: [] })
    expect(await run()).toEqual({ note: WM_NOTE.hdr })
  })

  it('没有视频流', async () => {
    vi.mocked(probeMedia).mockResolvedValueOnce({ streams: [] })
    expect(await run()).toEqual({ note: '去水印失败：没找到视频画面，已保留原视频' })
  })

  it.each([
    ['帧不够', { score: 0, reason: 'few-frames' as const }, undefined, WM_NOTE.fewFrames],
    ['画面太静', { score: 0.9, reason: 'static' as const }, R, WM_NOTE.static],
    ['没识别到', { score: 0, reason: 'none' as const }, undefined, WM_NOTE.none],
    ['分数不够自动处理', { score: 0.5 }, R, WM_NOTE.none]
  ])('%s：记下识别结果，保留原视频', async (_name, result, region, note) => {
    vi.mocked(locateWatermark).mockResolvedValueOnce({ result, region })
    expect(await run()).toEqual({ state: { width: 1920, height: 1080, detected: region }, note })
    expect(encodeWithFallback).not.toHaveBeenCalled()
  })
})

describe('处理', () => {
  it('识别到就转码，写下记录，返回处理好的视频', async () => {
    const r = await run()
    const out = join(tmp, 'video.wm.mp4')
    const state = { width: 1920, height: 1080, detected: R, applied: R }
    expect(r).toEqual({ video: out, codec: 'hevc', state })
    expect(readFileSync(out, 'utf8')).toBe('clean')
    expect(existsSync(join(tmp, 'video.wm.part'))).toBe(false)
    expect(JSON.parse(readFileSync(join(tmp, 'watermark.json'), 'utf8'))).toEqual({ size: 12, codec: 'hevc', state })
    expect(stages[0]).toEqual({ stage: 'detect' })
    expect(locateWatermark).toHaveBeenCalledWith(source, V, 100, ac.signal)
    expect(targetKbps).toHaveBeenCalledWith(4000, 1920, 1080, 30)
    expect(buildVideoOnlyArgs).toHaveBeenCalledWith({ input: source, output: join(tmp, 'video.wm.part'), region: R, enc: HEVC, kbps: 6000 })
    expect(vi.mocked(encodeWithFallback).mock.calls[0][0]).toMatchObject({
      srcCodec: 'h264',
      width: 1920,
      height: 1080,
      durationSec: 100,
      signal: ac.signal
    })
  })

  it('时长读不出来用接口给的，都没有时不报进度时长；码率未知时交给 targetKbps 估算', async () => {
    vi.mocked(probeMedia).mockResolvedValue({ video: V, streams: [] })
    await run({ stream: stream({ bandwidth: 0 }) })
    expect(locateWatermark).toHaveBeenLastCalledWith(source, V, 50, ac.signal)
    expect(targetKbps).toHaveBeenLastCalledWith(undefined, 1920, 1080, 30)
    rmSync(join(tmp, 'video.wm.mp4'))
    await run({ durationHint: undefined })
    expect(locateWatermark).toHaveBeenLastCalledWith(source, V, 0, ac.signal)
    expect(vi.mocked(encodeWithFallback).mock.lastCall![0].durationSec).toBeUndefined()
  })

  it('转码前先删掉上次崩溃留下的半成品，不和没退出的旧 ffmpeg 写同一个文件', async () => {
    writeFileSync(join(tmp, 'video.wm.part'), 'stale')
    let seen: boolean | undefined
    vi.mocked(encodeWithFallback).mockImplementationOnce(async () => {
      seen = existsSync(join(tmp, 'video.wm.part'))
      writeFileSync(join(tmp, 'video.wm.part'), 'clean')
      return HEVC
    })
    await run()
    expect(seen).toBe(false)
  })

  it('上次处理好的直接用；源文件变了或记录坏了就重新处理', async () => {
    const first = await run()
    vi.mocked(probeMedia).mockClear()
    expect(await run()).toEqual(first)
    expect(probeMedia).not.toHaveBeenCalled()

    writeFileSync(source, 'another source video')
    await run()
    expect(probeMedia).toHaveBeenCalledTimes(1)

    writeFileSync(join(tmp, 'watermark.json'), '{坏的')
    await run()
    expect(probeMedia).toHaveBeenCalledTimes(2)

    writeFileSync(join(tmp, 'watermark.json'), JSON.stringify({ size: 20, codec: 'hevc', state: { width: 1, height: 1 } }))
    await run()
    expect(probeMedia).toHaveBeenCalledTimes(3)
  })

  it('出错变成提示，删掉半成品', async () => {
    vi.mocked(encodeWithFallback).mockImplementationOnce(async () => {
      writeFileSync(join(tmp, 'video.wm.part'), 'half')
      throw new FfmpegError('去水印失败：磁盘空间不足')
    })
    expect(await run()).toEqual({
      state: { width: 1920, height: 1080, detected: R },
      note: '去水印失败：磁盘空间不足，已保留原视频'
    })
    expect(existsSync(join(tmp, 'video.wm.part'))).toBe(false)

    vi.mocked(probeMedia).mockRejectedValueOnce('读不了')
    expect(await run()).toEqual({ state: undefined, note: '去水印失败：读不了，已保留原视频' })
  })

  it('被中止时抛 AbortError，不写提示', async () => {
    vi.mocked(encodeWithFallback).mockRejectedValueOnce(new AbortError())
    await expect(run()).rejects.toBeInstanceOf(AbortError)
    // 中止导致 ffmpeg 以别的错误结束
    vi.mocked(encodeWithFallback).mockImplementationOnce(async () => {
      ac.abort()
      throw new FfmpegError('去水印失败（ffmpeg 退出码 255）')
    })
    await expect(run()).rejects.toBeInstanceOf(AbortError)
  })
})
