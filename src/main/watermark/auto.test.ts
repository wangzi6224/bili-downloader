import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WM_MARK, WM_NOTE } from '@shared/watermark'
import type { AiModelStatus, ProcessingInfo } from '@shared/types'
import type { DashStream } from '../bili/playurl'
import { AbortError, FfmpegError } from '../download/errors'
import type { Encoder } from './encoder'
import type { MediaProbe, ProbeVideo } from './probe'

vi.mock('./probe', () => ({ probeMedia: vi.fn() }))
vi.mock('./locate', async (importOriginal) => ({ ...(await importOriginal<typeof import('./locate')>()), locateWatermark: vi.fn() }))
vi.mock('./transcode', () => ({ encodeWithFallback: vi.fn() }))
vi.mock('./encoder', () => ({ targetKbps: vi.fn(() => 6000) }))
vi.mock('./delogo', () => ({ buildVideoOnlyArgs: vi.fn(() => ['args']) }))
vi.mock('./detect', () => ({ AUTO_MIN_SCORE: 0.6 }))
vi.mock('./ai/refine', () => ({ refineVideo: vi.fn() }))

const { probeMedia } = await import('./probe')
const { locateWatermark } = await import('./locate')
const { encodeWithFallback } = await import('./transcode')
const { targetKbps } = await import('./encoder')
const { buildVideoOnlyArgs } = await import('./delogo')
const { refineVideo } = await import('./ai/refine')
const { autoRemove, detectOnly } = await import('./auto')

const V: ProbeVideo = { index: 0, codec: 'h264', width: 1920, height: 1080, rotation: 0, fps: 30, hdr: false, dolbyVision: false }
const R = { x: 1668, y: 18, w: 234, h: 72 }
const HEVC: Encoder = { name: 'hevc_videotoolbox', codec: 'hevc', hw: true }
const stream = (over: Partial<DashStream> = {}): DashStream => ({ id: 80, codecid: 7, codecs: 'avc1.640032', bandwidth: 4_000_000, ...over })

let tmp = ''
let source = ''
let stages: ProcessingInfo[]
let ac: AbortController
type Input = Parameters<typeof autoRemove>[0]
/** ai 可以传测试里的假模型 */
const run = (over: Partial<Omit<Input, 'ai'>> & { ai?: { model: EventEmitter; spawn: unknown; threads?: number } } = {}) =>
  autoRemove({ tmp, source, stream: stream(), durationHint: 50, method: 'fast', signal: ac.signal, onStage: (p) => stages.push(p), ...over } as Input)

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
    expect(await run({ stream: s })).toEqual({ note: WM_NOTE.hdr() })
    expect(probeMedia).not.toHaveBeenCalled()
  })

  it('读出来是 HDR 或杜比视界', async () => {
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: { ...V, hdr: true }, streams: [] })
    expect(await run()).toEqual({ note: WM_NOTE.hdr() })
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: { ...V, dolbyVision: true }, streams: [] })
    expect(await run()).toEqual({ note: WM_NOTE.hdr() })
  })

  it('没有视频流', async () => {
    vi.mocked(probeMedia).mockResolvedValueOnce({ streams: [] })
    expect(await run()).toEqual({ note: `${WM_MARK}去水印失败：没找到视频画面，已保留原视频` })
  })

  it.each([
    ['帧不够', { score: 0, reason: 'few-frames' as const }, undefined, WM_NOTE.fewFrames()],
    ['画面太静', { score: 0.9, reason: 'static' as const }, R, WM_NOTE.static()],
    ['没识别到', { score: 0, reason: 'none' as const }, undefined, WM_NOTE.none()],
    ['分数不够自动处理', { score: 0.5 }, R, WM_NOTE.none()]
  ])('%s：记下识别结果，保留原视频', async (_name, result, region, note) => {
    vi.mocked(locateWatermark).mockResolvedValueOnce({ result, region })
    expect(await run()).toEqual({ state: { width: 1920, height: 1080, detected: region, found: false }, note })
    expect(encodeWithFallback).not.toHaveBeenCalled()
  })
})

describe('处理', () => {
  it('识别到就转码，写下记录，返回处理好的视频', async () => {
    const r = await run()
    const out = join(tmp, 'video.wm.mp4')
    const state = { width: 1920, height: 1080, detected: R, found: true, applied: R }
    expect(r).toEqual({ video: out, codec: 'hevc', state })
    expect(readFileSync(out, 'utf8')).toBe('clean')
    expect(existsSync(join(tmp, 'video.wm.part'))).toBe(false)
    expect(JSON.parse(readFileSync(join(tmp, 'watermark.json'), 'utf8'))).toEqual({ size: 12, codec: 'hevc', state, method: 'fast' })
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
      state: { width: 1920, height: 1080, detected: R, found: true },
      note: `${WM_MARK}去水印失败：磁盘空间不足，已保留原视频`
    })
    expect(existsSync(join(tmp, 'video.wm.part'))).toBe(false)

    vi.mocked(probeMedia).mockRejectedValueOnce('读不了')
    expect(await run()).toEqual({ state: undefined, note: `${WM_MARK}去水印失败：读不了，已保留原视频` })
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

/** 假的模型：download 时按 plan 发出进度、变成就绪或出错 */
class FakeModel extends EventEmitter {
  state: AiModelStatus = { state: 'missing', size: 100 }
  download = vi.fn(async (_o?: { threads?: number }) => {
    this.set({ state: 'downloading', size: 100, done: 40 })
    this.set({ state: 'downloading', size: 0 })
    if (this.plan === 'ok') this.set({ state: 'ready', size: 100 })
    else if (this.plan === 'error') this.set({ state: 'error', size: 100, message: '连不上模型的下载地址' })
    else if (this.plan === 'hang') await new Promise(() => {})
  })
  constructor(public plan: 'ok' | 'error' | 'cancel' | 'hang' | 'ready') {
    super()
    if (plan === 'ready') this.state = { state: 'ready', size: 100 }
  }
  ready = (): boolean => this.state.state === 'ready'
  status = (): AiModelStatus => this.state
  set(s: AiModelStatus): void {
    this.state = s
    this.emit('status', s)
  }
}

describe('AI 精修', () => {
  const spawn = vi.fn()
  const ai = (plan: FakeModel['plan']) => ({ model: new FakeModel(plan), spawn, threads: 6 })
  beforeEach(() => {
    vi.mocked(refineVideo)
      .mockReset()
      .mockImplementation(async (o) => {
        writeFileSync(o.output, 'ai clean')
        return { codec: 'h264', width: 1920, height: 1080, region: R }
      })
  })

  it('模型就绪：用 AI 精修处理视频流，用接口给的码率，进度不带手动标记', async () => {
    const a = ai('ready')
    const r = await run({ method: 'ai', ai: a })
    expect(r).toEqual({ video: join(tmp, 'video.wm.mp4'), codec: 'h264', state: { width: 1920, height: 1080, detected: R, found: true, applied: R } })
    expect(readFileSync(join(tmp, 'video.wm.mp4'), 'utf8')).toBe('ai clean')
    expect(vi.mocked(refineVideo).mock.calls[0][0]).toMatchObject({
      input: source,
      output: join(tmp, 'video.wm.part'),
      workDir: join(tmp, 'wm-work'),
      region: R,
      format: 'mp4',
      durationHint: 100,
      manual: false,
      kbps: 6000,
      model: a.model,
      spawn
    })
    expect(a.model.download).not.toHaveBeenCalled()
    expect(encodeWithFallback).not.toHaveBeenCalled()
    expect(JSON.parse(readFileSync(join(tmp, 'watermark.json'), 'utf8')).method).toBe('ai')
  })

  it('模型还没下载：先下载，进度报成 model 阶段，下好了再精修', async () => {
    const a = ai('ok')
    await run({ method: 'ai', ai: a })
    expect(a.model.download).toHaveBeenCalledWith({ threads: 6 })
    expect(stages.filter((p) => p.stage === 'model')).toEqual([
      { stage: 'model', pct: 0 },
      { stage: 'model', pct: 40 },
      { stage: 'model', pct: 0 }
    ])
    expect(refineVideo).toHaveBeenCalled()
    expect(a.model.listenerCount('status')).toBe(0)
  })

  it('模型下不下来：这次改用快速去除，提示原因；提示和结果一起缓存', async () => {
    const r = await run({ method: 'ai', ai: ai('error') })
    expect(refineVideo).not.toHaveBeenCalled()
    expect(encodeWithFallback).toHaveBeenCalled()
    expect(r).toMatchObject({ codec: 'hevc', note: WM_NOTE.aiFallback('连不上模型的下载地址') })
    vi.mocked(probeMedia).mockClear()
    expect(await run({ method: 'ai', ai: ai('error') })).toEqual(r)
    expect(probeMedia).not.toHaveBeenCalled()

    rmSync(join(tmp, 'video.wm.mp4'))
    expect((await run({ method: 'ai', ai: ai('cancel') })).note).toBe(WM_NOTE.aiFallback('下载没有完成'))
  })

  it('精修失败：改用快速去除并提示；被中止就直接结束', async () => {
    vi.mocked(refineVideo).mockImplementationOnce(async (o) => {
      writeFileSync(o.output, 'half')
      throw new Error('没有可用的 AI 推理方式')
    })
    const r = await run({ method: 'ai', ai: ai('ready') })
    expect(r).toMatchObject({ codec: 'hevc', note: WM_NOTE.aiFailed('没有可用的 AI 推理方式') })
    expect(readFileSync(join(tmp, 'video.wm.mp4'), 'utf8')).toBe('clean')

    rmSync(join(tmp, 'video.wm.mp4'))
    vi.mocked(refineVideo).mockRejectedValueOnce(new AbortError())
    await expect(run({ method: 'ai', ai: ai('ready') })).rejects.toBeInstanceOf(AbortError)
    vi.mocked(refineVideo).mockImplementationOnce(async () => {
      ac.abort()
      throw new Error('推理进程意外退出')
    })
    await expect(run({ method: 'ai', ai: ai('ready') })).rejects.toBeInstanceOf(AbortError)
  })

  it('等模型下载时被中止：不再等，抛 AbortError', async () => {
    const a = ai('hang')
    const p = run({ method: 'ai', ai: a })
    await vi.waitFor(() => expect(a.model.download).toHaveBeenCalled())
    ac.abort()
    await expect(p).rejects.toBeInstanceOf(AbortError)
    expect(a.model.listenerCount('status')).toBe(0)
  })

  it('换了处理方式不复用上次的结果；ai 方式没给依赖时按快速处理', async () => {
    await run()
    vi.mocked(probeMedia).mockClear()
    await run({ method: 'ai', ai: ai('ready') })
    expect(probeMedia).toHaveBeenCalledTimes(1)
    expect(refineVideo).toHaveBeenCalledTimes(1)

    rmSync(join(tmp, 'video.wm.mp4'))
    vi.mocked(encodeWithFallback).mockClear()
    await run({ method: 'ai' })
    expect(encodeWithFallback).toHaveBeenCalledTimes(1)
  })
})

describe('只识别（AI 助手提交的下载没选去水印）', () => {
  const detect = (over: Partial<Parameters<typeof detectOnly>[0]> = {}) =>
    detectOnly({ source, stream: stream(), durationHint: 50, signal: ac.signal, ...over })

  it('认出 B站水印：记下位置和 found，不转码', async () => {
    expect(await detect()).toEqual({ width: 1920, height: 1080, detected: R, found: true })
    expect(locateWatermark).toHaveBeenCalledWith(source, V, 100, ac.signal)
    expect(encodeWithFallback).not.toHaveBeenCalled()
  })

  it('分数不够、画面太静：只有可能的位置，found 为 false；没有时长时用提示的时长', async () => {
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: V, streams: [] })
    vi.mocked(locateWatermark).mockResolvedValueOnce({ result: { score: 0.5 }, region: R })
    expect(await detect()).toEqual({ width: 1920, height: 1080, detected: R, found: false })
    expect(vi.mocked(locateWatermark).mock.calls[0][2]).toBe(50)
    vi.mocked(locateWatermark).mockResolvedValueOnce({ result: { score: 0.9, reason: 'static' }, region: R })
    expect((await detect())?.found).toBe(false)
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: V, streams: [] })
    vi.mocked(locateWatermark).mockResolvedValueOnce({ result: { score: 0, reason: 'none' } })
    expect(await detect({ durationHint: undefined })).toEqual({ width: 1920, height: 1080, detected: undefined, found: false })
    expect(vi.mocked(locateWatermark).mock.calls[2][2]).toBe(0)
  })

  it('HDR、杜比视界、没有画面：不识别', async () => {
    expect(await detect({ stream: stream({ id: 125 }) })).toBeUndefined()
    expect(await detect({ stream: stream({ codecs: 'dvh1.08.07' }) })).toBeUndefined()
    expect(probeMedia).not.toHaveBeenCalled()
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: { ...V, hdr: true }, streams: [] })
    expect(await detect()).toBeUndefined()
    vi.mocked(probeMedia).mockResolvedValueOnce({ video: { ...V, dolbyVision: true }, streams: [] })
    expect(await detect()).toBeUndefined()
    vi.mocked(probeMedia).mockResolvedValueOnce({ streams: [] })
    expect(await detect()).toBeUndefined()
  })

  it('出错只记日志，不影响下载；被中止时抛 AbortError', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(probeMedia).mockRejectedValueOnce(new Error('读不了'))
    expect(await detect()).toBeUndefined()
    vi.mocked(probeMedia).mockRejectedValueOnce('坏了')
    expect(await detect()).toBeUndefined()
    expect(warn).toHaveBeenCalledWith('识别水印失败：', '读不了')
    expect(warn).toHaveBeenCalledWith('识别水印失败：', '坏了')
    warn.mockRestore()

    vi.mocked(locateWatermark).mockRejectedValueOnce(new AbortError())
    await expect(detect()).rejects.toBeInstanceOf(AbortError)
    vi.mocked(locateWatermark).mockImplementationOnce(async () => {
      ac.abort()
      throw new Error('ffmpeg 被结束')
    })
    await expect(detect()).rejects.toBeInstanceOf(AbortError)
  })
})
