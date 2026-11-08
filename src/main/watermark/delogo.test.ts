import { describe, expect, it } from 'vitest'
import { buildCoverExtractArgs, buildReplaceArgs, buildVideoOnlyArgs, coverFileName } from './delogo'
import { encoderArgs, type Encoder } from './encoder'
import type { MediaProbe } from './probe'

const X264: Encoder = { name: 'libx264', codec: 'h264', hw: false }
const VT_HEVC: Encoder = { name: 'hevc_videotoolbox', codec: 'hevc', hw: true }
const REGION = { x: 1100, y: 20, w: 150, h: 40 }
const DELOGO = 'delogo=x=1100:y=20:w=150:h=40'

const video = { index: 0, codec: 'h264', width: 1280, height: 720, rotation: 0, hdr: false, dolbyVision: false }

/** 项目合并出的 MP4：视频、音频、字幕、章节数据轨、封面 */
const MP4_PROBE: MediaProbe = {
  duration: 6,
  video,
  cover: { index: 4, codec: 'mjpeg' },
  streams: [
    { index: 0, type: 'video', codec: 'h264', attachedPic: false },
    { index: 1, type: 'audio', codec: 'aac', attachedPic: false },
    { index: 2, type: 'subtitle', codec: 'mov_text', attachedPic: false },
    { index: 3, type: 'data', codec: 'bin_data', attachedPic: false },
    { index: 4, type: 'video', codec: 'mjpeg', attachedPic: true }
  ]
}

const MKV_PROBE: MediaProbe = {
  duration: 6,
  video,
  cover: { index: 3, codec: 'mjpeg', mimetype: 'image/jpeg', filename: 'cover.jpg' },
  streams: [
    { index: 0, type: 'video', codec: 'h264', attachedPic: false },
    { index: 1, type: 'audio', codec: 'aac', attachedPic: false },
    { index: 2, type: 'subtitle', codec: 'subrip', attachedPic: false },
    { index: 3, type: 'video', codec: 'mjpeg', attachedPic: true }
  ]
}

describe('buildVideoOnlyArgs', () => {
  it('只转码视频流，去掉元数据，写成 mp4', () => {
    expect(buildVideoOnlyArgs({ input: 'tmp/video.m4s', output: 'tmp/video.wm.part', region: REGION, enc: X264, kbps: 3000 })).toEqual([
      '-i',
      'tmp/video.m4s',
      '-map',
      '0:v:0',
      '-filter:v:0',
      DELOGO,
      ...encoderArgs(X264, 3000),
      '-map_metadata',
      '-1',
      '-f',
      'mp4',
      'tmp/video.wm.part'
    ])
  })

  it('HEVC 标成 hvc1', () => {
    const args = buildVideoOnlyArgs({ input: 'a', output: 'b', region: REGION, enc: VT_HEVC, kbps: 3000 })
    expect(args.join(' ')).toContain(`${encoderArgs(VT_HEVC, 3000).join(' ')} -tag:v:0 hvc1 -map_metadata -1`)
  })
})

describe('buildReplaceArgs', () => {
  it('MP4 带封面：显式映射，封面标回 attached_pic，不映射章节的数据轨', () => {
    const args = buildReplaceArgs({ probe: MP4_PROBE, input: 'o.mp4', output: 'o.mp4.wm.tmp', region: REGION, enc: X264, kbps: 3000, format: 'mp4' })
    expect(args.join(' ')).toBe(
      [
        '-i o.mp4 -map 0:0 -map 0:a? -map 0:s? -map 0:4 -c copy',
        encoderArgs(X264, 3000).join(' '),
        `-filter:v:0 ${DELOGO} -disposition:v:1 attached_pic`,
        '-map_chapters 0 -max_muxing_queue_size 4096 -movflags +faststart -f mp4 o.mp4.wm.tmp'
      ].join(' ')
    )
    expect(args).not.toContain('0:3')
    // 不能出现单独的 -map 0
    expect(args.some((a, i) => a === '-map' && args[i + 1] === '0')).toBe(false)
  })

  it('MP4 没有封面；HEVC 标成 hvc1', () => {
    const probe = { ...MP4_PROBE, cover: undefined }
    const args = buildReplaceArgs({ probe, input: 'o.mp4', output: 'o.tmp', region: REGION, enc: VT_HEVC, kbps: 3000, format: 'mp4' })
    expect(args.join(' ')).toBe(
      [
        '-i o.mp4 -map 0:0 -map 0:a? -map 0:s? -c copy',
        encoderArgs(VT_HEVC, 3000).join(' '),
        `-filter:v:0 ${DELOGO} -tag:v:0 hvc1`,
        '-map_chapters 0 -max_muxing_queue_size 4096 -movflags +faststart -f mp4 o.tmp'
      ].join(' ')
    )
  })

  it('MKV：不映射封面视频流，导出的封面作为附件挂回去；HEVC 不打 hvc1 标签', () => {
    const args = buildReplaceArgs({
      probe: MKV_PROBE,
      input: 'o.mkv',
      output: 'o.mkv.wm.tmp',
      region: REGION,
      enc: VT_HEVC,
      kbps: 3000,
      format: 'mkv',
      coverFile: '/tmp/x/cover.jpg'
    })
    expect(args.join(' ')).toBe(
      [
        '-i o.mkv -map 0:0 -map 0:a? -map 0:s? -map 0:t? -c copy',
        encoderArgs(VT_HEVC, 3000).join(' '),
        `-filter:v:0 ${DELOGO}`,
        '-attach /tmp/x/cover.jpg -metadata:s:t:0 mimetype=image/jpeg -metadata:s:t:0 filename=cover.jpg',
        '-map_chapters 0 -max_muxing_queue_size 4096 -f matroska o.mkv.wm.tmp'
      ].join(' ')
    )
    expect(args).not.toContain('0:3')
  })

  it('MKV 已有附件时，封面排在后面', () => {
    const probe: MediaProbe = { ...MKV_PROBE, streams: [...MKV_PROBE.streams, { index: 4, type: 'attachment', codec: 'ttf', attachedPic: false }] }
    const args = buildReplaceArgs({ probe, input: 'a', output: 'b', region: REGION, enc: X264, kbps: 1, format: 'mkv', coverFile: 'c.jpg' })
    expect(args.join(' ')).toContain('-attach c.jpg -metadata:s:t:1 mimetype=image/jpeg -metadata:s:t:1 filename=cover.jpg')
  })

  it('MKV 封面信息缺失时按导出文件的扩展名推断', () => {
    const base = { ...MKV_PROBE, cover: undefined }
    const run = (coverFile: string): string =>
      buildReplaceArgs({ probe: base, input: 'a', output: 'b', region: REGION, enc: X264, kbps: 1, format: 'mkv', coverFile }).join(' ')
    expect(run('/t/cover.PNG')).toContain('mimetype=image/png -metadata:s:t:0 filename=cover.PNG')
    expect(run('/t/cover.webp')).toContain('mimetype=image/webp')
    expect(run('/t/cover.jpg')).toContain('mimetype=image/jpeg')
    expect(run('/t/cover')).toContain('mimetype=image/jpeg -metadata:s:t:0 filename=cover')
  })

  it('MKV 没有封面时不挂附件', () => {
    const probe = { ...MKV_PROBE, cover: undefined }
    const args = buildReplaceArgs({ probe, input: 'a', output: 'b', region: REGION, enc: X264, kbps: 1, format: 'mkv' })
    expect(args).not.toContain('-attach')
    expect(args.slice(-2)).toEqual(['matroska', 'b'])
  })

  it('没有视频流时报错', () => {
    expect(() =>
      buildReplaceArgs({ probe: { streams: [] }, input: 'a', output: 'b', region: REGION, enc: X264, kbps: 1, format: 'mp4' })
    ).toThrow('文件里没有视频画面')
  })
})

describe('封面导出', () => {
  it('原样复制成图片', () => {
    expect(buildCoverExtractArgs('o.mkv', 3, '/t/cover.jpg')).toEqual([
      '-y',
      '-i',
      'o.mkv',
      '-map',
      '0:3',
      '-c',
      'copy',
      '-frames:v',
      '1',
      '-f',
      'image2',
      '/t/cover.jpg'
    ])
  })

  it('文件名按编码或 MIME 类型取扩展名', () => {
    expect(coverFileName({ index: 3, codec: 'mjpeg' })).toBe('cover.jpg')
    expect(coverFileName({ index: 3, codec: 'png', mimetype: 'image/png' })).toBe('cover.png')
    expect(coverFileName({ index: 3, codec: 'webp' })).toBe('cover.webp')
    expect(coverFileName({ index: 3, codec: '', mimetype: 'image/PNG' })).toBe('cover.png')
    expect(coverFileName({ index: 3, codec: 'bmp', mimetype: 'image/bmp' })).toBe('cover.jpg')
    expect(coverFileName({ index: 3, codec: 'bmp', mimetype: 'weird' })).toBe('cover.jpg')
    expect(coverFileName({ index: 3, codec: 'bmp' })).toBe('cover.jpg')
  })
})
