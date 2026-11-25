import { describe, expect, it } from 'vitest'
import { DEFAULT_YT_OPTIONS } from '@shared/options'
import type { DownloadOptions, YtOptions } from '@shared/types'
import { UnsupportedError } from '../bili/http'
import videoJson from './__fixtures__/video.json'
import { audioFormats, codecOf, pickAudio, pickYtFormats, qualityText, videoFormats, ytStreamInfo } from './pick'
import type { YtFormat, YtVideoInfo } from './types'

const VIDEO = videoJson as unknown as YtVideoInfo

/** 手写的格式：纯视频流、纯音频流 */
const v = (format_id: string, height: number, vcodec: string, o: Partial<YtFormat> = {}): YtFormat => ({
  format_id,
  ext: 'mp4',
  vcodec,
  acodec: 'none',
  height,
  fps: 30,
  protocol: 'https',
  tbr: 1000,
  ...o
})
const a = (format_id: string, acodec: string, o: Partial<YtFormat> = {}): YtFormat => ({
  format_id,
  ext: 'm4a',
  vcodec: 'none',
  acodec,
  protocol: 'https',
  abr: 128,
  ...o
})
const info = (formats: YtFormat[], o: Partial<YtVideoInfo> = {}): YtVideoInfo => ({ id: 'abcdefghijk', title: 'T', formats, ...o })

type Opts = Pick<DownloadOptions, 'qn' | 'output' | 'yt'>
const opts = (qn: number, output: Opts['output'] = 'full', yt: Partial<YtOptions> = {}): Opts => ({ qn, output, yt: { ...DEFAULT_YT_OPTIONS, ...yt } })
const ids = (fs: YtFormat[]): string[] => fs.map((f) => f.format_id)

describe('codecOf', () => {
  it('认出 AVC、VP9、AV1，其余为空', () => {
    expect(codecOf('avc1.640028')).toBe('avc')
    expect(codecOf('H264')).toBe('avc')
    expect(codecOf('vp09.00.50.08')).toBe('vp9')
    expect(codecOf('vp9')).toBe('vp9')
    expect(codecOf('av01.0.12M.08')).toBe('av1')
    expect(codecOf('hev1.1.6.L93')).toBeUndefined()
    expect(codecOf('none')).toBeUndefined()
    expect(codecOf(null)).toBeUndefined()
    expect(codecOf(undefined)).toBeUndefined()
  })
})

describe('videoFormats / audioFormats', () => {
  it('真实样本：只留纯视频流，去掉故事板、整合流和不认识的', () => {
    const list = videoFormats(VIDEO)
    expect(list).toHaveLength(37)
    expect(list.every((f) => f.acodec === 'none' && (f.height ?? 0) > 0)).toBe(true)
    expect(ids(list)).not.toContain('18')
    expect(ids(list)).not.toContain('sb0')
    expect(ids(list)).not.toContain('233')
  })

  it('排除 DRM、mhtml、没有高度的', () => {
    const list = videoFormats(
      info([
        v('ok', 720, 'avc1'),
        v('drm', 720, 'avc1', { has_drm: true }),
        v('mh', 720, 'avc1', { protocol: 'mhtml' }),
        v('h0', 0, 'avc1'),
        v('hnull', 720, 'avc1', { height: null }),
        v('hevc', 720, 'hev1')
      ])
    )
    expect(ids(list)).toEqual(['ok'])
  })

  it('没有纯视频流时退回带声音的整合流；没有 formats 时为空', () => {
    expect(ids(videoFormats(info([v('18', 360, 'avc1', { acodec: 'mp4a.40.2' }), a('140', 'mp4a.40.2')])))).toEqual(['18'])
    // acodec 缺省也算纯视频流
    expect(ids(videoFormats(info([v('x', 360, 'avc1', { acodec: undefined }), v('18', 360, 'avc1', { acodec: 'mp4a' })])))).toEqual(['x'])
    expect(videoFormats({})).toEqual([])
  })

  it('音频：只要纯音频的 AAC / Opus', () => {
    expect(ids(audioFormats(VIDEO))).toEqual(['139', '249', '250', '140', '251'])
    expect(
      ids(
        audioFormats(
          info([
            a('aac', 'mp4a.40.2'),
            a('nov', 'opus', { vcodec: undefined }),
            a('ac3', 'ac-3'),
            a('drm', 'opus', { has_drm: true }),
            a('mh', 'opus', { protocol: 'mhtml' }),
            v('18', 360, 'avc1', { acodec: 'mp4a' }),
            a('none', 'none')
          ])
        )
      )
    ).toEqual(['aac', 'nov'])
    expect(audioFormats({})).toEqual([])
  })
})

describe('qualityText', () => {
  it('高度、30 以上的帧率、HDR、编码', () => {
    expect(qualityText(v('a', 2160, 'vp09', { fps: 59.94, dynamic_range: 'HDR10' }))).toBe('2160p60 HDR · VP9')
    expect(qualityText(v('a', 2160, 'vp09', { fps: 59.94, dynamic_range: 'HDR10' }), false)).toBe('2160p60 HDR')
    expect(qualityText(v('a', 720, 'avc1', { fps: 30, dynamic_range: 'SDR' }))).toBe('720p · AVC')
    expect(qualityText(v('a', 1080, 'av01', { fps: null, dynamic_range: null }))).toBe('1080p · AV1')
    expect(qualityText(v('a', 480, 'hev1'))).toBe('480p')
  })
})

describe('pickAudio', () => {
  it('真实样本：best 取码率最高，按偏好挑 Opus 或 AAC', () => {
    expect(pickAudio(VIDEO, 'best')?.format_id).toBe('140')
    expect(pickAudio(VIDEO, 'opus')?.format_id).toBe('251')
    expect(pickAudio(VIDEO, 'aac')?.format_id).toBe('140')
  })

  it('原声优先：language_preference 高的、format_note 带 original 的排前面，-drc 排最后', () => {
    const fs = [
      a('251-0', 'opus', { abr: 160, language: 'en', language_preference: -1, format_note: 'English' }),
      a('251-drc', 'opus', { abr: 200, language: 'ja', language_preference: 10, format_note: 'Japanese original (default), DRC' }),
      a('251-1', 'opus', { abr: 100, language: 'ja', language_preference: 10, format_note: 'Japanese original (default)' }),
      a('251-2', 'opus', { abr: 300, language: 'fr', language_preference: null, format_note: null })
    ]
    expect(pickAudio(info(fs), 'best')?.format_id).toBe('251-1')
    // 只有 -drc 和配音时也宁可要配音
    expect(pickAudio(info([fs[0], fs[1]]), 'best')?.format_id).toBe('251-0')
  })

  it('同等条件下 https 优先于 m3u8，再比码率（tbr、vbr、abr 依次取）', () => {
    expect(pickAudio(info([a('hls', 'mp4a', { protocol: 'm3u8_native', abr: 500 }), a('http', 'mp4a', { abr: 100 })]), 'best')?.format_id).toBe('http')
    expect(pickAudio(info([a('noproto', 'mp4a', { protocol: undefined, abr: 50 }), a('hls', 'mp4a', { protocol: 'm3u8', abr: 500 })]), 'best')?.format_id).toBe(
      'noproto'
    )
    expect(pickAudio(info([a('abr', 'mp4a', { abr: 100 }), a('tbr', 'mp4a', { abr: 50, tbr: 200 }), a('zero', 'mp4a', { abr: null })]), 'best')?.format_id).toBe('tbr')
    expect(pickAudio(info([a('zero', 'mp4a', { abr: null }), a('vbr', 'mp4a', { abr: null, vbr: 10 })]), 'best')?.format_id).toBe('vbr')
  })

  it('没有偏好的编码时退回最好的；没有音频时为空', () => {
    expect(pickAudio(info([a('opus', 'opus')]), 'aac')?.format_id).toBe('opus')
    expect(pickAudio(info([v('v', 720, 'avc1')]), 'best')).toBeUndefined()
  })
})

describe('pickYtFormats', () => {
  it('最高画质：2160p 没有 AVC 时用 VP9（https 优先于 m3u8），配最好的音频', () => {
    expect(pickYtFormats(VIDEO, opts(0))).toEqual({
      video: expect.objectContaining({ format_id: '313' }),
      audio: expect.objectContaining({ format_id: '140' }),
      format: 'mp4',
      qualityLabel: '2160p · VP9',
      quality: '2160p',
      codec: 'VP9',
      height: 2160,
      notes: ['2160p 没有 AVC 编码，改用 VP9'],
      spec: '313,140'
    })
  })

  it('不传 yt 选项时用默认值', () => {
    expect(pickYtFormats(VIDEO, { qn: 1080, output: 'full' }).spec).toBe('137,140')
  })

  it('限高：取不高于目标的最高画质，AVC 的 https 流', () => {
    const p = pickYtFormats(VIDEO, opts(1080))
    expect(p.spec).toBe('137,140')
    expect(p.notes).toEqual([])
    expect(pickYtFormats(VIDEO, opts(1000)).spec).toBe('136,140')
  })

  it('目标比最高画质还高时备注；比最低还低时取最低、不备注', () => {
    const high = pickYtFormats(VIDEO, opts(4320, 'full', { codecOrder: ['vp9', 'av1', 'avc'] }))
    expect(high.height).toBe(2160)
    expect(high.notes).toEqual(['这个视频最高只有 2160p（选的是 4320p）'])
    const low = pickYtFormats(VIDEO, opts(100))
    expect(low.video?.format_id).toBe('160')
    expect(low.notes).toEqual([])
  })

  it('编码偏好：按 codecOrder 挑，不在列表里的排最后', () => {
    expect(pickYtFormats(VIDEO, opts(1080, 'full', { codecOrder: ['av1', 'vp9', 'avc'] })).video?.format_id).toBe('399')
    expect(pickYtFormats(VIDEO, opts(1080, 'full', { codecOrder: ['vp9', 'avc', 'av1'] })).video?.format_id).toBe('248')
    // codecOrder 里只有 vp9 时，没有 vp9 的画质按码率挑别的，并备注
    const p = pickYtFormats(info([v('avc', 720, 'avc1', { tbr: 100 }), v('av1', 720, 'av01', { tbr: 200 }), a('a', 'mp4a')]), opts(0, 'full', { codecOrder: ['vp9'] }))
    expect(p.video?.format_id).toBe('av1')
    expect(p.notes).toEqual(['720p 没有 VP9 编码，改用 AV1'])
  })

  it('同编码时 https 优先，再比码率', () => {
    const fs = [v('hls', 1080, 'avc1', { protocol: 'm3u8_native', tbr: 9000 }), v('lo', 1080, 'avc1', { tbr: 100 }), v('hi', 1080, 'avc1', { tbr: 200 })]
    expect(pickYtFormats(info(fs), opts(0, 'video')).video?.format_id).toBe('hi')
  })

  it('同画质高帧率优先，哪怕编码不是首选', () => {
    const fs = [v('avc30', 1080, 'avc1', { fps: 30 }), v('vp60', 1080, 'vp09', { fps: 60 }), v('nofps', 1080, 'avc1', { fps: null }), a('a', 'mp4a')]
    const p = pickYtFormats(info(fs), opts(0))
    expect(p.video?.format_id).toBe('vp60')
    expect(p.qualityLabel).toBe('1080p60 · VP9')
    expect(p.notes).toEqual(['1080p 没有 AVC 编码，改用 VP9'])
    expect(pickYtFormats(info([v('nofps', 720, 'avc1', { fps: null })]), opts(0, 'video')).video?.format_id).toBe('nofps')
  })

  it('HDR：开了偏好且有 HDR 时选 HDR，否则选 SDR', () => {
    const fs = [v('sdr', 2160, 'vp09', { dynamic_range: 'SDR' }), v('hdr', 2160, 'vp09', { dynamic_range: 'HDR10', tbr: 1 }), a('a', 'opus')]
    expect(pickYtFormats(info(fs), opts(0, 'full', { hdr: true, codecOrder: ['vp9'] })).video?.format_id).toBe('hdr')
    expect(pickYtFormats(info(fs), opts(0, 'full', { hdr: false, codecOrder: ['vp9'] })).video?.format_id).toBe('sdr')
    expect(pickYtFormats(info([fs[0], fs[2]]), opts(0, 'full', { hdr: true, codecOrder: ['vp9'] })).video?.format_id).toBe('sdr')
  })

  it('只要画面：不配音频', () => {
    const p = pickYtFormats(VIDEO, opts(720, 'video'))
    expect(p.audio).toBeUndefined()
    expect(p.spec).toBe('136')
  })

  it('只要音频：AAC 存 m4a，Opus 存 opus', () => {
    expect(pickYtFormats(VIDEO, opts(1080, 'audio'))).toEqual({
      video: undefined,
      audio: expect.objectContaining({ format_id: '140' }),
      format: 'm4a',
      qualityLabel: '仅音频 · AAC 130',
      quality: 'AAC 130',
      codec: '',
      height: undefined,
      notes: [],
      spec: '140'
    })
    const opus = pickYtFormats(VIDEO, opts(0, 'audio', { audio: 'opus' }))
    expect([opus.format, opus.quality, opus.spec]).toEqual(['opus', 'OPUS 129', '251'])
    // 没有码率时只写编码
    expect(pickYtFormats(info([a('a', 'mp4a', { abr: null })]), opts(0, 'audio')).quality).toBe('AAC')
  })

  it('整合流本身带声音，不再配音频', () => {
    const p = pickYtFormats(info([v('18', 360, 'avc1.42001E', { acodec: 'mp4a.40.2' }), a('140', 'mp4a')]), opts(0))
    expect(p.spec).toBe('18')
    expect(p.audio).toBeUndefined()
  })

  it('WebM 装不下 AVC 或 AAC 时改存 MKV 并备注', () => {
    const vp9: Partial<YtOptions> = { codecOrder: ['vp9', 'av1', 'avc'] }
    const ok = pickYtFormats(VIDEO, opts(0, 'full', { ...vp9, container: 'webm', audio: 'opus' }))
    expect([ok.format, ok.spec, ok.notes]).toEqual(['webm', '313,251', []])
    const aac = pickYtFormats(VIDEO, opts(0, 'full', { ...vp9, container: 'webm', audio: 'aac' }))
    expect([aac.format, aac.notes]).toEqual(['mkv', ['WebM 装不下所选的编码，改存为 MKV']])
    const avc = pickYtFormats(VIDEO, opts(1080, 'full', { container: 'webm', audio: 'opus' }))
    expect([avc.format, avc.spec]).toEqual(['mkv', '137,251'])
    // 只要画面时只看视频编码
    expect(pickYtFormats(VIDEO, opts(0, 'video', { ...vp9, container: 'webm' })).format).toBe('webm')
    // 整合流按它自己的音频编码判断
    const muxed = pickYtFormats(info([v('18', 360, 'vp09', { acodec: 'mp4a.40.2' })]), opts(0, 'full', { ...vp9, container: 'webm' }))
    expect(muxed.format).toBe('mkv')
  })

  it('MKV 容器原样使用', () => {
    expect(pickYtFormats(VIDEO, opts(1080, 'full', { container: 'mkv' })).format).toBe('mkv')
  })

  it('上次选定的格式都还在时沿用，不重新选也不备注', () => {
    const p = pickYtFormats(VIDEO, opts(0), '137,251')
    expect(p.spec).toBe('137,251')
    expect(p.notes).toEqual([])
    expect(pickYtFormats(VIDEO, opts(0, 'audio'), '140')).toMatchObject({ video: undefined, format: 'm4a', spec: '140' })
    // 整合流沿用时音频不再单列
    expect(pickYtFormats(info([v('18', 360, 'avc1', { acodec: 'mp4a' })]), opts(0), '18').spec).toBe('18')
  })

  it('上次选定的格式不全在时重新选', () => {
    expect(pickYtFormats(VIDEO, opts(1080), '137,999').spec).toBe('137,140')
    expect(pickYtFormats(VIDEO, opts(1080), '').spec).toBe('137,140')
  })

  it('没有任何格式时报无法下载', () => {
    expect(() => pickYtFormats(info([]), opts(0))).toThrow(UnsupportedError)
    expect(() => pickYtFormats(info([]), opts(0))).toThrow('这个视频没有可下载的格式')
    expect(() => pickYtFormats({ id: 'x', title: 'T' }, opts(0, 'audio'))).toThrow('这个视频没有可下载的格式')
  })

  it('只要音频但没有单独的音轨时报错', () => {
    const muxedOnly = info([v('18', 360, 'avc1', { acodec: 'mp4a' })])
    expect(() => pickYtFormats(muxedOnly, opts(0, 'audio'))).toThrow(UnsupportedError)
    expect(() => pickYtFormats(muxedOnly, opts(0, 'audio'))).toThrow('这个视频没有单独的音轨，无法只下载音频')
    // 沿用的格式里只有视频
    expect(() => pickYtFormats(VIDEO, opts(0, 'audio'), '137')).toThrow('没有单独的音轨')
  })
})

describe('ytStreamInfo', () => {
  it('真实样本：画质从高到低、各画质的编码、音频、字幕、章节、大小', () => {
    const s = ytStreamInfo(VIDEO)
    expect(s.qualities.map((q) => q.qn)).toEqual([2160, 1440, 1080, 720, 480, 360, 240, 144])
    expect(s.qualities[0]).toEqual({ qn: 2160, label: '2160p', needVip: false, needLogin: false, codecs: ['vp9', 'av1'] })
    expect(s.qualities[2].codecs).toEqual(['avc', 'vp9', 'av1'])
    expect(s.qualities.at(-1)?.label).toBe('144p')
    expect(s.audios).toEqual([])
    expect(s.hasAudio).toBe(true)
    expect(s.yt).toEqual({
      audios: [
        { id: 'best', label: '最佳', available: true },
        { id: 'opus', label: 'Opus', available: true },
        { id: 'aac', label: 'AAC', available: true }
      ],
      hdr: false,
      subtitles: [
        { lang: 'en', name: 'English', auto: false },
        { lang: 'ja', name: 'Japanese', auto: false }
      ],
      autoLang: 'en',
      chapters: 2,
      size: expect.objectContaining({ 2160: 358608461, 1080: 80911999, 144: 2058142 })
    })
  })

  it('手写样本：HDR 和高帧率写进标签，没有音频，字幕去掉直播聊天，自动字幕语言退回视频语言', () => {
    const s = ytStreamInfo(
      info(
        [
          v('a', 2160, 'vp09', { fps: 60 }),
          v('b', 2160, 'vp09', { fps: 60, dynamic_range: 'HDR10' }),
          v('c', 1080, 'avc1', { fps: null, filesize: 100 }),
          v('d', 1080, 'av01', { filesize_approx: 200 }),
          v('e', 720, 'avc1', { fps: null }),
          v('f', 720, 'vp09', { fps: undefined })
        ],
        { subtitles: { live_chat: [{ ext: 'json' }], fr: [] }, automatic_captions: { en: [{ ext: 'vtt' }] }, language: 'de', chapters: null }
      )
    )
    expect(s.qualities.map((q) => [q.qn, q.label, q.codecs])).toEqual([
      [2160, '2160p60 HDR', ['vp9']],
      [1080, '1080p', ['avc', 'av1']],
      [720, '720p', ['avc', 'vp9']]
    ])
    expect(s.hasAudio).toBe(false)
    expect(s.yt?.audios.every((x) => !x.available)).toBe(true)
    expect(s.yt?.hdr).toBe(true)
    expect(s.yt?.subtitles).toEqual([{ lang: 'fr', name: 'fr', auto: false }])
    expect(s.yt?.autoLang).toBe('de')
    expect(s.yt?.chapters).toBe(0)
    expect(s.yt?.size).toEqual({ 2160: 0, 1080: 200, 720: 0 })
  })

  it('没有字幕和语言时为空', () => {
    const s = ytStreamInfo(info([], { language: '' }))
    expect(s.qualities).toEqual([])
    expect(s.yt?.subtitles).toEqual([])
    expect(s.yt?.autoLang).toBeUndefined()
    expect(s.yt?.chapters).toBe(0)
  })
})
