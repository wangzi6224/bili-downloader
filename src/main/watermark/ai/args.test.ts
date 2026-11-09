import { describe, expect, it } from 'vitest'
import type { MediaProbe } from '../probe'
import { buildDecodeArgs, buildEncodeArgs, colorArgs, colorSpec, fpsRational, rateValue } from './args'

describe('帧率', () => {
  it('NTSC 帧率换成精确分数，整数原样，其他保留三位小数', () => {
    expect(fpsRational(29.97)).toBe('30000/1001')
    expect(fpsRational(23.98)).toBe('24000/1001')
    expect(fpsRational(59.94)).toBe('60000/1001')
    expect(fpsRational(25)).toBe('25')
    expect(fpsRational(30.004)).toBe('30')
    expect(fpsRational(12.5)).toBe('12500/1000')
    expect(fpsRational(undefined)).toBe('30')
    expect(fpsRational(0)).toBe('30')
    expect(fpsRational(Number.NaN)).toBe('30')
  })

  it('分数换成数值', () => {
    expect(rateValue('30000/1001')).toBeCloseTo(29.97, 2)
    expect(rateValue('25')).toBe(25)
  })
})

describe('色彩', () => {
  it('用 setparams 写回原视频的色彩标记，没有的、不认识的不写', () => {
    expect(colorArgs({ range: 'tv', space: 'bt709', primaries: 'bt709', transfer: 'bt709' })).toEqual([
      '-filter:v:0',
      'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709'
    ])
    expect(colorArgs({ range: 'pc', space: 'weird', primaries: 'jedec-p22', transfer: 'log100' })).toEqual(['-filter:v:0', 'setparams=range=pc'])
    expect(colorArgs({ space: 'weird' })).toEqual([])
    expect(colorArgs(undefined)).toEqual([])
  })

  it('换算矩阵：按标记，没有时高清用 BT.709、标清用 BT.601', () => {
    expect(colorSpec({ space: 'bt709', range: 'tv' }, 480)).toEqual({ matrix: 'bt709', full: false })
    expect(colorSpec({ space: 'smpte170m' }, 1080)).toEqual({ matrix: 'bt601', full: false })
    expect(colorSpec({ space: 'bt470bg', range: 'pc' }, 1080)).toEqual({ matrix: 'bt601', full: true })
    expect(colorSpec(undefined, 1080)).toEqual({ matrix: 'bt709', full: false })
    expect(colorSpec(undefined, 480)).toEqual({ matrix: 'bt601', full: false })
  })
})

describe('buildDecodeArgs', () => {
  it('只解码主视频，恒定帧率、偶数宽高、yuv420p 原始帧', () => {
    expect(buildDecodeArgs('/v/a.mp4', 2, '30000/1001')).toEqual([
      '-i',
      '/v/a.mp4',
      '-map',
      '0:2',
      '-vf',
      'fps=30000/1001,crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0,format=yuv420p',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'yuv420p',
      'pipe:1'
    ])
  })
})

describe('buildEncodeArgs', () => {
  const enc = { name: 'libx264', codec: 'h264' as const, hw: false }
  const base: MediaProbe = {
    duration: 10,
    video: { index: 0, codec: 'h264', width: 1920, height: 1080, rotation: 0, hdr: false, dolbyVision: false, color: { range: 'tv', space: 'bt709' } },
    streams: [
      { index: 0, type: 'video', codec: 'h264', attachedPic: false },
      { index: 1, type: 'audio', codec: 'aac', attachedPic: false }
    ]
  }

  it('MP4：视频从管道读，其他从原文件复制，写回色彩标记', () => {
    const a = buildEncodeArgs({ probe: base, input: '/v/a.mp4', output: '/v/a.mp4.wm.tmp', width: 1920, height: 1080, rate: '30', enc, kbps: 3000, format: 'mp4' })
    expect(a.slice(0, 12)).toEqual(['-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', '1920x1080', '-r', '30', '-i', 'pipe:0', '-i', '/v/a.mp4'])
    expect(a.join(' ')).toContain('-map 0:v:0 -map 1:a? -map 1:s? -c copy -c:v:0 libx264')
    expect(a.join(' ')).toContain('-filter:v:0 setparams=range=tv:colorspace=bt709')
    expect(a.join(' ')).toContain('-map_metadata 1 -map_chapters 1')
    expect(a.slice(-5)).toEqual(['-movflags', '+faststart', '-f', 'mp4', '/v/a.mp4.wm.tmp'])
    expect(a).not.toContain('-tag:v:0')
  })

  it('MP4 带封面、HEVC：封面单独映射，标成 hvc1', () => {
    const probe: MediaProbe = { ...base, cover: { index: 2, codec: 'mjpeg' } }
    const a = buildEncodeArgs({ probe, input: 'i', output: 'o', width: 8, height: 8, rate: '25', enc: { name: 'hevc_videotoolbox', codec: 'hevc', hw: true }, kbps: 1, format: 'mp4' })
    expect(a.join(' ')).toContain('-map 1:2')
    expect(a.join(' ')).toContain('-disposition:v:1 attached_pic')
    expect(a.join(' ')).toContain('-tag:v:0 hvc1')
  })

  it('MKV：附件也复制，导出的封面重新挂上，排在原有附件后面', () => {
    const probe: MediaProbe = {
      ...base,
      cover: { index: 3, codec: 'png', mimetype: 'image/png', filename: 'cover.png' },
      streams: [...base.streams, { index: 2, type: 'attachment', attachedPic: false }]
    }
    const a = buildEncodeArgs({ probe, input: 'i', output: 'o', width: 8, height: 8, rate: '25', enc, kbps: 1, format: 'mkv', coverFile: '/w/cover.png' })
    expect(a.join(' ')).toContain('-map 1:t?')
    expect(a.join(' ')).toContain('-attach /w/cover.png -metadata:s:t:1 mimetype=image/png -metadata:s:t:1 filename=cover.png')
    expect(a.slice(-3)).toEqual(['-f', 'matroska', 'o'])
  })

  it('MKV 封面没有 MIME 和文件名时按扩展名补', () => {
    const probe: MediaProbe = { ...base, cover: { index: 3, codec: 'webp' } }
    const a = buildEncodeArgs({ probe, input: 'i', output: 'o', width: 8, height: 8, rate: '25', enc, kbps: 1, format: 'mkv', coverFile: '/w/c.webp' })
    expect(a.join(' ')).toContain('mimetype=image/webp')
    expect(a.join(' ')).toContain('filename=c.webp')
    const jpg = buildEncodeArgs({ probe, input: 'i', output: 'o', width: 8, height: 8, rate: '25', enc, kbps: 1, format: 'mkv', coverFile: '/w/c.jpg' })
    expect(jpg.join(' ')).toContain('mimetype=image/jpeg')
  })
})
