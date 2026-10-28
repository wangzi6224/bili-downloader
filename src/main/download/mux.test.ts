import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/' } }))
const { buildMuxArgs, explainFfmpegError } = await import('./mux')

describe('buildMuxArgs', () => {
  it('muxes hevc into mp4 with cover, subtitles and chapters', () => {
    const args = buildMuxArgs({
      video: 'v.m4s',
      audio: 'a.m4s',
      out: 'o.tmp',
      format: 'mp4',
      title: 'T',
      hevc: true,
      cover: 'c.jpg',
      subtitles: [{ path: 's.srt', language: 'chi', title: '中文' }],
      chapters: 'ch.txt'
    })
    expect(args.join(' ')).toBe(
      [
        '-i v.m4s -i a.m4s -i c.jpg -i s.srt -f ffmetadata -i ch.txt',
        '-map 0:v:0 -map 1:a:0 -map 2:v:0 -map 3:s:0 -map_chapters 4',
        '-c copy -c:s mov_text -disposition:v:1 attached_pic',
        '-metadata:s:s:0 language=chi -metadata:s:s:0 title=中文 -metadata:s:s:0 handler_name=中文',
        '-tag:v:0 hvc1 -metadata title=T -movflags +faststart -f mp4 o.tmp'
      ].join(' ')
    )
  })

  it('attaches the cover and copies srt into mkv', () => {
    const args = buildMuxArgs({
      video: 'v.m4s',
      audio: 'a.m4s',
      out: 'o.tmp',
      format: 'mkv',
      title: 'T',
      hevc: true,
      cover: 'c.png',
      subtitles: [{ path: 's.srt', language: 'eng', title: 'English' }]
    }).join(' ')
    expect(args).toContain('-c:s srt')
    expect(args).toContain('-attach c.png -metadata:s:t:0 mimetype=image/png')
    expect(args).not.toContain('hvc1')
    expect(args).toContain('-f matroska')
  })

  it('writes m4a through the mp4 muxer with an attached cover', () => {
    const args = buildMuxArgs({ audio: 'a.m4s', out: 'o.tmp', format: 'm4a', title: 'T', cover: 'c.jpg' }).join(' ')
    expect(args).toBe(
      '-i a.m4s -i c.jpg -map 0:a:0 -map 1:v:0 -c copy -disposition:v:0 attached_pic -metadata title=T -movflags +faststart -f mp4 o.tmp'
    )
  })

  it('ignores subtitles for audio-only output', () => {
    const args = buildMuxArgs({ audio: 'a.m4s', out: 'o.tmp', format: 'flac', title: 'T', subtitles: [{ path: 's', language: 'chi', title: 'x' }] })
    expect(args.join(' ')).not.toContain('s.srt')
    expect(args).not.toContain('-c:s')
  })
})

describe('explainFfmpegError', () => {
  it('maps common failures to readable messages', () => {
    expect(explainFfmpegError('...: No space left on device', 1)).toBe('合并失败：磁盘空间不足')
    expect(explainFfmpegError('moov atom not found', 1)).toContain('重新下载')
  })
})
