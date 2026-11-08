import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { ProcessingInfo, TaskInfo } from '@shared/types'
import type { Encoder } from './encoder'
import type { MediaProbe, ProbeVideo } from './probe'

vi.mock('./probe', () => ({ probeMedia: vi.fn() }))
vi.mock('./locate', () => ({ locateWatermark: vi.fn() }))
vi.mock('./frames', () => ({ grabJpeg: vi.fn() }))
vi.mock('./ffmpegJob', () => ({ ffmpegCapture: vi.fn() }))
vi.mock('./transcode', () => ({ encodeWithFallback: vi.fn() }))
vi.mock('./encoder', () => ({ targetKbps: vi.fn(() => 5000) }))
vi.mock('./delogo', () => ({
  buildReplaceArgs: vi.fn(() => ['replace']),
  buildCoverExtractArgs: vi.fn(() => ['extract']),
  coverFileName: vi.fn(() => 'cover.jpg')
}))

const { probeMedia } = await import('./probe')
const { locateWatermark } = await import('./locate')
const { grabJpeg } = await import('./frames')
const { ffmpegCapture } = await import('./ffmpegJob')
const { encodeWithFallback } = await import('./transcode')
const { buildReplaceArgs, buildCoverExtractArgs } = await import('./delogo')
const { prepareManual, previewFrame, replaceVideo, requireVideoTask } = await import('./manual')

const V: ProbeVideo = { index: 0, codec: 'hevc', width: 1920, height: 1080, rotation: 0, bitrate: 3000, fps: 25, hdr: false, dolbyVision: false }
const PROBE: MediaProbe = { duration: 200, video: V, streams: [] }
const R = { x: 1668, y: 18, w: 234, h: 72 }
const X264: Encoder = { name: 'libx264', codec: 'h264', hw: false }

let dir = ''
let file = ''
const task = (over: Partial<TaskInfo> = {}) =>
  requireVideoTask({
    id: 't1',
    title: '视频',
    groupTitle: '视频',
    item: { key: 'k', kind: 'ugc', title: '视频', index: 1, cid: 1, duration: 90 },
    options: normalizeOptions({}),
    relBase: '视频',
    status: 'done',
    outputPath: file,
    downloaded: 1,
    total: 1,
    speed: 0,
    createdAt: 0,
    ...over
  })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'manual-'))
  file = join(dir, '视频.mp4')
  writeFileSync(file, 'video')
  vi.mocked(probeMedia).mockReset().mockResolvedValue(PROBE)
  vi.mocked(locateWatermark).mockReset().mockResolvedValue({ result: { score: 0.5 }, region: R })
  vi.mocked(grabJpeg).mockReset().mockResolvedValue('data:image/jpeg;base64,AA')
  vi.mocked(ffmpegCapture).mockReset()
  vi.mocked(encodeWithFallback)
    .mockReset()
    .mockImplementation(async (job) => {
      job.build(X264)
      return X264
    })
  vi.mocked(buildReplaceArgs).mockClear()
  vi.mocked(buildCoverExtractArgs).mockClear()
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('requireVideoTask', () => {
  it('不存在、没完成、只有音频、文件没了都报错', () => {
    expect(() => requireVideoTask(undefined)).toThrow('任务不存在')
    expect(() => task({ status: 'paused' })).toThrow('只能处理已经下载完成的视频')
    expect(() => task({ outputPath: undefined })).toThrow('只能处理已经下载完成的视频')
    expect(() => task({ options: normalizeOptions({ output: 'audio' }) })).toThrow('这个任务只有音频，没有画面')
    expect(() => task({ outputPath: join(dir, '没有.mp4') })).toThrow('找不到视频文件')
    expect(task().outputPath).toBe(file)
  })
})

describe('prepareManual', () => {
  it('当场识别，在 30% 处抽一帧', async () => {
    expect(await prepareManual(task())).toEqual({
      width: 1920,
      height: 1080,
      duration: 200,
      time: 60,
      image: 'data:image/jpeg;base64,AA',
      region: R,
      detected: true,
      applied: undefined,
      blocker: undefined
    })
    expect(locateWatermark).toHaveBeenCalledWith(file, V, 200, undefined)
    expect(grabJpeg).toHaveBeenCalledWith(file, 0, 60, { signal: undefined })
  })

  it('下载时识别过、尺寸对得上就直接用', async () => {
    const known = { x: 10, y: 10, w: 100, h: 30 }
    const p = await prepareManual(task({ watermark: { width: 1920, height: 1080, detected: known } }))
    expect(p).toMatchObject({ region: known, detected: true })
    expect(locateWatermark).not.toHaveBeenCalled()
    // 尺寸不一样（比如重新下载了别的清晰度）就重新识别
    await prepareManual(task({ watermark: { width: 1280, height: 720, detected: known } }))
    expect(locateWatermark).toHaveBeenCalledTimes(1)
  })

  it('去过一次水印的不再识别，给默认框；HDR 不能处理；时长读不出来用接口给的', async () => {
    vi.mocked(probeMedia).mockResolvedValue({ video: { ...V, hdr: true }, streams: [] })
    const p = await prepareManual(task({ watermark: { width: 1920, height: 1080, applied: R } }))
    expect(p).toMatchObject({
      duration: 90,
      time: 27,
      region: { x: 1542, y: 22, w: 356, h: 86 },
      detected: false,
      applied: R,
      blocker: '暂不支持 HDR 和杜比视界视频'
    })
    expect(locateWatermark).not.toHaveBeenCalled()

    vi.mocked(probeMedia).mockResolvedValue({ video: { ...V, dolbyVision: true }, streams: [] })
    vi.mocked(locateWatermark).mockResolvedValue({ result: { score: 0, reason: 'none' } })
    const q = await prepareManual(task({ item: { key: 'k', kind: 'ugc', title: '视频', index: 1, cid: 1 } }))
    expect(q).toMatchObject({ duration: 0, time: 0, detected: false, blocker: '暂不支持 HDR 和杜比视界视频' })
  })

  it('文件里没有视频流', async () => {
    vi.mocked(probeMedia).mockResolvedValue({ streams: [] })
    await expect(prepareManual(task())).rejects.toThrow('文件里没有视频画面')
  })
})

describe('previewFrame', () => {
  it('时间收进视频长度内，区域收进画面内', async () => {
    await previewFrame(task(), 50, { x: 0, y: 0, w: 100, h: 30 })
    expect(grabJpeg).toHaveBeenLastCalledWith(file, 0, 50, { region: { x: 1, y: 1, w: 99, h: 29 } })
    await previewFrame(task(), 999)
    expect(grabJpeg).toHaveBeenLastCalledWith(file, 0, 199.9, { region: undefined })
    await previewFrame(task(), Number.NaN)
    expect(grabJpeg).toHaveBeenLastCalledWith(file, 0, 0, { region: undefined })
    vi.mocked(probeMedia).mockResolvedValue({ video: V, streams: [] })
    await previewFrame(task(), 5)
    expect(grabJpeg).toHaveBeenLastCalledWith(file, 0, 0, { region: undefined })
  })

  it('区域太小报错', async () => {
    await expect(previewFrame(task(), 1, { x: 10, y: 10, w: 2, h: 2 })).rejects.toThrow('水印区域太小')
  })
})

describe('replaceVideo', () => {
  let stages: ProcessingInfo[]
  const ac = new AbortController()
  const input = (over: Partial<Parameters<typeof replaceVideo>[0]> = {}) => ({
    input: file,
    output: `${file}.wm.tmp`,
    workDir: join(dir, 'work'),
    region: R,
    format: 'mp4' as const,
    durationHint: 90,
    signal: ac.signal,
    onStage: (p: ProcessingInfo) => stages.push(p),
    ...over
  })
  beforeEach(() => {
    stages = []
  })

  it('MP4：直接转码，返回实际编码和收进画面的区域', async () => {
    expect(await replaceVideo(input({ region: { ...R, x: 0 } }))).toEqual({
      codec: 'h264',
      width: 1920,
      height: 1080,
      region: { ...R, x: 1, w: 233 }
    })
    expect(stages[0]).toEqual({ manual: true, stage: 'queue' })
    expect(ffmpegCapture).not.toHaveBeenCalled()
    expect(buildReplaceArgs).toHaveBeenCalledWith({
      probe: PROBE,
      input: file,
      output: `${file}.wm.tmp`,
      region: { ...R, x: 1, w: 233 },
      enc: X264,
      kbps: 5000,
      format: 'mp4',
      coverFile: undefined
    })
    expect(vi.mocked(encodeWithFallback).mock.calls[0][0]).toMatchObject({
      srcCodec: 'hevc',
      durationSec: 200,
      manual: true,
      signal: ac.signal
    })
  })

  it('MKV 带封面：先把封面导出成图片再挂回去；导出失败就不带封面', async () => {
    const probe = { ...PROBE, duration: undefined, cover: { index: 3, codec: 'mjpeg' } }
    vi.mocked(probeMedia).mockResolvedValue(probe)
    const cover = join(dir, 'work', 'cover.jpg')
    vi.mocked(ffmpegCapture).mockImplementationOnce(async () => {
      writeFileSync(cover, 'jpg')
      return { code: 0, stdout: Buffer.alloc(0), stderr: '' }
    })
    await replaceVideo(input({ format: 'mkv' }))
    expect(buildCoverExtractArgs).toHaveBeenCalledWith(file, 3, cover)
    expect(vi.mocked(buildReplaceArgs).mock.lastCall![0]).toMatchObject({ format: 'mkv', coverFile: cover })
    expect(vi.mocked(encodeWithFallback).mock.lastCall![0].durationSec).toBe(90)

    rmSync(join(dir, 'work'), { recursive: true })
    vi.mocked(ffmpegCapture).mockResolvedValueOnce({ code: 1, stdout: Buffer.alloc(0), stderr: 'x' })
    await replaceVideo(input({ format: 'mkv' }))
    expect(vi.mocked(buildReplaceArgs).mock.lastCall![0].coverFile).toBeUndefined()

    // 返回 0 但没写出文件
    mkdirSync(join(dir, 'work'), { recursive: true })
    vi.mocked(ffmpegCapture).mockResolvedValueOnce({ code: 0, stdout: Buffer.alloc(0), stderr: '' })
    await replaceVideo(input({ format: 'mkv' }))
    expect(vi.mocked(buildReplaceArgs).mock.lastCall![0].coverFile).toBeUndefined()
  })

  it('HDR、区域太小时报错，不转码', async () => {
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: { ...V, hdr: true }, streams: [] })
    await expect(replaceVideo(input())).rejects.toThrow('暂不支持 HDR 和杜比视界视频')
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: { ...V, dolbyVision: true }, streams: [] })
    await expect(replaceVideo(input())).rejects.toThrow('暂不支持 HDR 和杜比视界视频')
    await expect(replaceVideo(input({ region: { x: 5000, y: 0, w: 10, h: 10 } }))).rejects.toThrow('水印区域太小')
    expect(encodeWithFallback).not.toHaveBeenCalled()
  })
})
