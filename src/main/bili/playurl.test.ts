import { describe, expect, it } from 'vitest'
import { pickStreams, streamInfoFromPlay, type DashStream, type PickOptions, type PlayInfo } from './playurl'

const v = (id: number, codecid: number, codecs: string): DashStream => ({ id, codecid, codecs, bandwidth: id * 1000, baseUrl: `v${id}-${codecid}` })
const a = (id: number, bandwidth: number, codecs = 'mp4a.40.2'): DashStream => ({ id, codecs, bandwidth, baseUrl: `a${id}` })

const INFO: PlayInfo = {
  quality: 80,
  support_formats: [
    { quality: 120, new_description: '4K 超清', need_vip: true },
    { quality: 80, new_description: '1080P 高清' },
    { quality: 64, new_description: '720P 准高清' }
  ],
  dash: {
    video: [v(80, 7, 'avc1.640032'), v(80, 12, 'hev1.1.6.L150'), v(64, 7, 'avc1.64001F'), v(64, 13, 'av01.0.08M.08')],
    audio: [a(30216, 67000), a(30232, 132000)],
    dolby: { audio: [a(30250, 448000, 'ec-3')] },
    flac: { audio: a(30251, 1500000, 'fLaC') }
  }
}

const base: PickOptions = { qn: 120, codecOrder: ['avc', 'hevc', 'av1'], audio: 'best', output: 'full', container: 'mp4' }

describe('pickStreams', () => {
  it('falls back to the highest available quality and follows codec order', () => {
    const p = pickStreams(INFO, { ...base, codecOrder: ['hevc', 'avc', 'av1'] })
    expect(p.video?.baseUrl).toBe('v80-12')
    expect(p.quality).toBe('1080P 高清')
    expect(p.notes).toEqual([])
  })

  it('notes when the preferred codec is missing', () => {
    const p = pickStreams(INFO, { ...base, qn: 64, codecOrder: ['hevc', 'av1', 'avc'] })
    expect(p.video?.baseUrl).toBe('v64-13')
    expect(p.notes[0]).toContain('已改用 AV1')
  })

  it('prefers dolby for mp4 and flac for mkv when audio is best', () => {
    expect(pickStreams(INFO, base).audioKind).toBe('eac3')
    expect(pickStreams(INFO, { ...base, container: 'mkv' }).audioKind).toBe('flac')
  })

  it('switches to mkv when flac is requested in mp4', () => {
    const p = pickStreams(INFO, { ...base, audio: 'flac' })
    expect(p.container).toBe('mkv')
    expect(p.notes.some((n) => n.includes('MKV'))).toBe(true)
  })

  it('walks down the aac ladder', () => {
    expect(pickStreams(INFO, { ...base, audio: '192k' }).audio?.id).toBe(30232)
    expect(pickStreams(INFO, { ...base, audio: '64k' }).audio?.id).toBe(30216)
  })

  it('handles audio-only and video-only output', () => {
    const audio = pickStreams(INFO, { ...base, output: 'audio' })
    expect(audio.video).toBeUndefined()
    expect(audio.audioKind).toBe('flac')
    const video = pickStreams(INFO, { ...base, output: 'video' })
    expect(video.audio).toBeUndefined()
    expect(video.qualityLabel).toContain('无声')
  })
})

describe('streamInfoFromPlay', () => {
  it('lists codecs per quality and available audio', () => {
    const s = streamInfoFromPlay(INFO)
    expect(s.qualities.find((q) => q.qn === 80)?.codecs).toEqual(['avc', 'hevc'])
    expect(s.qualities.find((q) => q.qn === 120)?.codecs).toEqual([])
    expect(s.audios.find((x) => x.id === '192k')?.available).toBe(false)
    expect(s.audios.find((x) => x.id === 'flac')?.available).toBe(true)
    expect(s.hasAudio).toBe(true)
  })
})
