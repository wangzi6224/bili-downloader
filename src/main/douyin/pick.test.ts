import { describe, expect, it } from 'vitest'
import { t } from '@shared/i18n'
import { DY_ORIGINAL_QN, normalizeOptions } from '@shared/options'
import type { DownloadOptions } from '@shared/types'
import { DyUnavailableError } from './errors'
import { dyStreamInfo, pickDouyin, type DyAvPick, type DyFilesPick } from './pick'
import type { DyAudioRate, DyAweme, DyBitRate, DyImage, DyVideo } from './types'

const ID = '7000000000000000001'
const host = (name: string): string => `https://cdn.example.com/${name}`

const opts = (over: Partial<DownloadOptions> = {}): DownloadOptions => normalizeOptions({ qn: 0, ...over }, 0)

const rate = (side: number, over: Partial<DyBitRate> & { size?: number } = {}): DyBitRate => {
  const { size, ...rest } = over
  const gear = rest.gear_name ?? `g${side}${rest.is_h265 ? 'h' : ''}`
  return {
    gear_name: gear,
    format: 'mp4',
    bit_rate: side * 1000,
    FPS: 30,
    is_h265: 0,
    // 竖屏：短边是宽
    play_addr: { uri: `u-${gear}`, url_list: [host(gear)], width: side, height: Math.round((side * 16) / 9), data_size: size ?? side * 10 },
    ...rest
  }
}

const track = (bitrate: number | undefined, over: NonNullable<DyAudioRate['audio_meta']> = {}): DyAudioRate => ({
  audio_meta: { bitrate, size: bitrate, file_hash: `hash-${bitrate}`, url_list: { main_url: host(`a${bitrate}`) }, ...over }
})

const work = (video: DyVideo | undefined, over: Partial<DyAweme> = {}): DyAweme => ({ aweme_id: ID, video, ...over })

const av = (a: DyAweme, o = opts(), locked?: string): DyAvPick => {
  const p = pickDouyin(a, o, locked)
  expect(p.type).toBe('av')
  return p as DyAvPick
}
const files = (a: DyAweme, o = opts()): DyFilesPick => {
  const p = pickDouyin(a, o)
  expect(p.type).toBe('files')
  return p as DyFilesPick
}

const LADDER: DyVideo = {
  play_addr: { uri: 'v-origin', url_list: [host('plain')], width: 720, height: 1280, data_size: 7 },
  bit_rate: [rate(540), rate(1080), rate(720), rate(1080, { is_h265: 1 })]
}

describe('整合文件', () => {
  it('缺省选最高画质，按画面短边算', () => {
    expect(av(work(LADDER))).toEqual({
      type: 'av',
      parts: [{ name: 'video.mp4', urls: [host('g1080')], fingerprint: 'dy-v-u-g1080-g1080-mp4-10800', estimate: 10800 }],
      video: 0,
      audio: undefined,
      muxed: true,
      format: 'mp4',
      qualityLabel: '1080p · AVC',
      quality: '1080p',
      codec: 'AVC',
      height: 1080,
      hevc: false,
      notes: [],
      spec: 'g1080|mp4'
    })
  })

  it('按编码偏好选 HEVC', () => {
    const p = av(work(LADDER), opts({ codecOrder: ['hevc', 'avc', 'av1'], container: 'mkv' }))
    expect(p).toMatchObject({ codec: 'HEVC', hevc: true, format: 'mkv', notes: [] })
  })

  it('指定画质时选不超过它的最高一档', () => {
    expect(av(work(LADDER), opts({ qn: 720 })).height).toBe(720)
    expect(av(work(LADDER), opts({ qn: 900 }))).toMatchObject({ height: 720, notes: [] })
  })

  it('要的画质比最低档还低时用最低档', () => {
    expect(av(work(LADDER), opts({ qn: 360 })).height).toBe(540)
  })

  it('要的画质比最高档还高时说明实际下载的画质', () => {
    expect(av(work(LADDER), opts({ qn: 2160 })).notes).toEqual([t('dy.noteLowerQuality', { want: '2160p', got: '1080p' })])
  })

  it('这一档没有想要的编码时换一种并说明', () => {
    expect(av(work(LADDER), opts({ qn: 720, codecOrder: ['hevc', 'avc', 'av1'] })).notes).toEqual([
      t('dy.noteCodecFallback', { quality: '720p', want: 'HEVC', got: 'AVC' })
    ])
  })

  it('编码偏好第一个是 av1 时按后面第一个可能有的编码判断', () => {
    const p = av(work(LADDER), opts({ codecOrder: ['av1', 'hevc', 'avc'] }))
    expect(p).toMatchObject({ codec: 'HEVC', notes: [] })
  })

  it('编码偏好里没有的编码排在最后；没有可比较的偏好时不说明', () => {
    const o = { ...opts(), codecOrder: [] as DownloadOptions['codecOrder'] }
    expect(av(work(LADDER), o)).toMatchObject({ height: 1080, notes: [] })
    const only = { ...opts(), codecOrder: ['hevc'] as DownloadOptions['codecOrder'] }
    expect(av(work(LADDER), only).codec).toBe('HEVC')
  })

  it('同编码时先比帧率再比码率，高帧率写进画质说明', () => {
    const video: DyVideo = {
      bit_rate: [
        rate(1080, { gear_name: 'low', FPS: undefined, bit_rate: undefined }),
        rate(1080, { gear_name: 'low2', FPS: undefined, bit_rate: 5 }),
        rate(1080, { gear_name: 'fast', FPS: 59.94, bit_rate: 1 }),
        rate(1080, { gear_name: 'faster-rich', FPS: 59.94, bit_rate: 9 })
      ]
    }
    expect(av(work(video))).toMatchObject({ spec: 'faster-rich|mp4', qualityLabel: '1080p60 · AVC' })
    expect(av(work({ bit_rate: video.bit_rate!.slice(0, 2) })).spec).toBe('low2|mp4')
  })

  it('HDR 只在开了选项时选', () => {
    const video: DyVideo = { bit_rate: [rate(1080, { gear_name: 'sdr', HDR_type: '0' }), rate(1080, { gear_name: 'hdr', HDR_type: '1', bit_rate: 1 })] }
    expect(av(work(video)).spec).toBe('sdr|mp4')
    expect(av(work(video), opts({ dy: { live: true, music: true, hdr: true } }))).toMatchObject({ spec: 'hdr|mp4', qualityLabel: '1080p HDR · AVC' })
  })

  it('只有 HDR 版本时即使没开选项也用它；开了但没有 HDR 时用普通版本', () => {
    expect(av(work({ bit_rate: [rate(720, { HDR_type: '2' })] })).qualityLabel).toBe('720p HDR · AVC')
    expect(av(work(LADDER), opts({ dy: { live: true, music: true, hdr: true } })).qualityLabel).toBe('1080p · AVC')
  })

  it('仅视频时仍下整合文件，但不取声音', () => {
    const p = av(work(LADDER), opts({ output: 'video' }))
    expect(p).toMatchObject({ video: 0, audio: undefined, muxed: undefined })
  })

  it('续传时沿用锁定的画质档，不在了就重新挑', () => {
    expect(av(work(LADDER), opts(), 'g540|mp4')).toMatchObject({ height: 540, spec: 'g540|mp4' })
    expect(av(work(LADDER), opts(), 'gone|mp4').spec).toBe('g1080|mp4')
    expect(av(work(LADDER), opts(), 'original').spec).toBe('g1080|mp4')
  })

  it('画质档没有 format 字段时续传也沿用锁定的画质档', () => {
    const video: DyVideo = { bit_rate: [rate(540, { format: undefined }), rate(1080, { format: undefined })] }
    const first = av(work(video), opts({ qn: 540 }))
    expect(av(work(video), opts(), first.spec).height).toBe(540)
  })

  it('分享页来的作品加上说明', () => {
    expect(av(work(LADDER, { fromShare: true })).notes).toEqual([t('dy.noteShare')])
  })
})

describe('纯画面和整合文件混合', () => {
  it('选的清晰度只有整合文件时用整合文件，不会悄悄换清晰度', () => {
    const video: DyVideo = {
      bit_rate: [rate(540), rate(1080, { gear_name: 'd1080', format: 'dash' })],
      bit_rate_audio: [{ audio_meta: { url_list: { main_url: host('sound') } } }]
    }
    expect(av(work(video), opts({ qn: 540 }))).toMatchObject({ height: 540, muxed: true, audio: undefined })
    expect(av(work(video))).toMatchObject({ height: 1080, audio: 1 })
  })
})

describe('纯画面加音轨', () => {
  const LONG: DyVideo = {
    bit_rate: [rate(720), rate(720, { gear_name: 'd720', format: 'dash' }), rate(1080, { gear_name: 'd1080', format: 'dash' })],
    bit_rate_audio: [
      track(64_000),
      {},
      { audio_meta: { bitrate: 999_999, url_list: {} } },
      track(128_000, { url_list: { main_url: host('main'), backup_url: host('backup'), fallback_url: host('fallback') } })
    ]
  }

  it('有单独音轨时用 dash 画面和码率最高的音轨', () => {
    const p = av(work(LONG))
    expect(p).toMatchObject({ video: 0, audio: 1, muxed: undefined, spec: 'd1080|dash' })
    expect(p.parts[1]).toEqual({
      name: 'audio.m4a',
      urls: [host('main'), host('backup'), host('fallback')],
      fingerprint: 'dy-a-hash-128000-128000',
      estimate: 128_000
    })
  })

  it('仅视频时只下画面', () => {
    const p = av(work(LONG), opts({ output: 'video' }))
    expect(p.parts).toHaveLength(1)
    expect(p).toMatchObject({ audio: undefined, muxed: undefined, spec: 'd1080|dash' })
  })

  it('音轨缺大小和哈希时用码率做指纹', () => {
    const video: DyVideo = { ...LONG, bit_rate_audio: [track(undefined, { size: undefined, file_hash: undefined }), track(5, { size: undefined, file_hash: undefined })] }
    expect(av(work(video)).parts[1]).toMatchObject({ fingerprint: 'dy-a-5-0', estimate: 0 })
  })

  it('有音轨但没有 dash 画面时用整合文件', () => {
    expect(av(work({ bit_rate: [rate(720)], bit_rate_audio: [track(1)] }))).toMatchObject({ muxed: true, audio: undefined, spec: 'g720|mp4' })
  })

  it('有 dash 画面但没有音轨时不用它', () => {
    const video: DyVideo = { bit_rate: [rate(720), rate(1080, { format: 'dash' })], bit_rate_audio: null }
    expect(av(work(video)).spec).toBe('g720|mp4')
  })
})

describe('原画', () => {
  it('按上传源文件的播放接口取', () => {
    expect(av(work(LADDER), opts({ qn: DY_ORIGINAL_QN }))).toEqual({
      type: 'av',
      parts: [
        {
          name: 'video.mp4',
          urls: ['https://www.douyin.com/aweme/v1/play/?video_id=v-origin&ratio=default&line=0'],
          fingerprint: 'dy-o-v-origin',
          estimate: 0
        }
      ],
      video: 0,
      muxed: true,
      format: 'mp4',
      qualityLabel: t('dy.original'),
      quality: t('dy.original'),
      codec: '',
      hevc: false,
      notes: [],
      spec: 'original'
    })
    expect(av(work(LADDER), opts({ qn: DY_ORIGINAL_QN, output: 'video' })).muxed).toBeUndefined()
  })

  it('分享页的作品或没有源文件标识时退回最高画质', () => {
    const o = opts({ qn: DY_ORIGINAL_QN })
    expect(av(work(LADDER, { fromShare: true }), o)).toMatchObject({ spec: 'g1080|mp4', notes: [t('dy.noteShare')] })
    expect(av(work({ bit_rate: LADDER.bit_rate }), o)).toMatchObject({ spec: 'g1080|mp4', notes: [] })
  })
})

describe('只有一个播放地址', () => {
  it('用播放地址，画质取画面短边', () => {
    expect(av(work({ play_addr: LADDER.play_addr, bit_rate: null }))).toEqual({
      type: 'av',
      parts: [{ name: 'video.mp4', urls: [host('plain')], fingerprint: 'dy-p-v-origin-7', estimate: 7 }],
      video: 0,
      muxed: true,
      format: 'mp4',
      qualityLabel: '720p',
      quality: '720p',
      codec: '',
      height: 720,
      hevc: false,
      notes: [],
      spec: 'plain'
    })
  })

  it('地址没带尺寸时用视频尺寸', () => {
    const p = av(work({ play_addr: { url_list: ['', host('x')] }, width: 1920, height: 1080 }), opts({ output: 'video' }))
    expect(p).toMatchObject({ quality: '1080p', muxed: undefined })
    expect(p.parts[0]).toMatchObject({ urls: [host('x')], fingerprint: 'dy-p-undefined-0', estimate: 0 })
  })

  it('完全没有尺寸时画质留空', () => {
    expect(av(work({ play_addr: { url_list: [host('x')] } }))).toMatchObject({ qualityLabel: 'MP4', quality: '', height: undefined })
  })

  it.each([
    ['没有视频字段', work(undefined)],
    ['没有任何地址', work({ bit_rate: [{ format: 'mp4' }], play_addr: { url_list: [''] } })],
    ['仅音频且没有任何地址', work({})]
  ])('%s时报没有可下载内容', (name, a) => {
    const o = opts({ output: name.startsWith('仅音频') ? 'audio' : 'full' })
    expect(() => pickDouyin(a, o)).toThrow(DyUnavailableError)
    expect(() => pickDouyin(a, o)).toThrow(t('dy.noStream'))
  })
})

describe('仅音频', () => {
  const o = opts({ output: 'audio' })

  it('有单独音轨时只下音轨', () => {
    const p = av(work({ ...LADDER, bit_rate_audio: [track(96_000)] }), o)
    expect(p).toMatchObject({ audio: 0, format: 'm4a', quality: 'M4A', qualityLabel: t('dy.audioOnly'), spec: 'audio' })
    expect(p.parts).toHaveLength(1)
    expect(p.parts[0].name).toBe('audio.m4a')
    expect(p.video).toBeUndefined()
  })

  it('没有音轨时下最小的整合文件', () => {
    expect(av(work(LADDER), o).parts[0].urls).toEqual([host('g540')])
    const unknown: DyVideo = { bit_rate: [rate(540), { format: 'mp4', play_addr: { url_list: [host('nosize')] } }, { play_addr: { url_list: [host('nosize2')] } }] }
    expect(av(work(unknown), o).parts[0].urls).toEqual([host('nosize')])
  })

  it('没有画质列表时用播放地址', () => {
    expect(av(work({ play_addr: LADDER.play_addr }), o).parts[0].fingerprint).toBe('dy-p-v-origin-7')
  })
})

describe('图文', () => {
  const image = (n: number, over: Partial<DyImage> = {}): DyImage => ({ url_list: [host(`${n}.webp`), host(`${n}.jpeg?sig=1`), host(`${n}-b.jpg`)], ...over })
  const music = { play_url: { uri: 'music-fake', url_list: [host('song.mp3')] } }

  it('图片按序号命名，优先 jpeg，备用地址只用同一种格式；带上配乐', () => {
    const p = files(work(undefined, { images: [image(1), image(2)], music }))
    expect(p.parts).toEqual([
      { name: '01.jpg', urls: [host('1.jpeg?sig=1'), host('1-b.jpg')], fingerprint: `dy-i-${ID}-0`, estimate: 307200 },
      { name: '02.jpg', urls: [host('2.jpeg?sig=1'), host('2-b.jpg')], fingerprint: `dy-i-${ID}-1`, estimate: 307200 },
      { name: 'music.mp3', urls: [host('song.mp3')], fingerprint: 'dy-m-music-fake', estimate: 1228800 }
    ])
    expect(p).toMatchObject({ qualityLabel: t('dy.imagesLabel', { count: 2 }), quality: '', notes: [], spec: 'images' })
  })

  it('扩展名按地址取，认不出时用 webp；序号位数随张数增加', () => {
    const images: DyImage[] = [{ url_list: [host('a.PNG')] }, { url_list: [host('noext')] }, { url_list: [host('c.heic?x=.jpg')] }]
    const p = files(work(undefined, { images: [...images, ...Array.from({ length: 97 }, () => ({}))] }), opts({ output: 'video' }))
    expect(p.parts.map((x) => x.name)).toEqual(['001.png', '002.webp', '003.heic'])
  })

  it('实况图带上最清晰的短视频', () => {
    const live = image(1, { video: { bit_rate: [rate(540, { bit_rate: undefined }), rate(720), rate(540, { gear_name: 'x', bit_rate: 1 })] } })
    const plain = image(2, { video: { play_addr: { uri: 'live2', url_list: [host('live2')] } } })
    const none = image(3, { video: {} })
    const p = files(work(undefined, { images: [live, plain, none] }))
    expect(p.parts.map((x) => x.name)).toEqual(['01.jpg', '01.mp4', '02.jpg', '02.mp4', '03.jpg'])
    expect(p.parts[1].urls).toEqual([host('g720')])
    expect(p.parts[3].urls).toEqual([host('live2')])
    expect(p.qualityLabel).toBe(t('dy.liveLabel', { count: 3 }))
  })

  it('关掉实况和配乐时只下图片', () => {
    const live = image(1, { video: { bit_rate: [rate(720)] } })
    const p = files(work(undefined, { images: [live], music }), opts({ dy: { live: false, music: false, hdr: false } }))
    expect(p.parts.map((x) => x.name)).toEqual(['01.jpg'])
    expect(p.qualityLabel).toBe(t('dy.imagesLabel', { count: 1 }))
  })

  it('配乐没有地址时说明；仅视频时不下配乐', () => {
    expect(files(work(undefined, { images: [image(1)] })).notes).toEqual([t('dy.noteNoMusic')])
    const silent = files(work(undefined, { images: [image(1)], music }), opts({ output: 'video' }))
    expect(silent.parts.map((x) => x.name)).toEqual(['01.jpg'])
    expect(silent.notes).toEqual([])
  })

  it('仅音频时只下配乐，即使配乐选项关着', () => {
    const m4a = { play_url: { url_list: [host('song.m4a?sig=1')] } }
    const p = files(work(undefined, { images: [image(1)], music: m4a }), opts({ output: 'audio', dy: { live: true, music: false, hdr: false } }))
    expect(p.parts).toEqual([{ name: 'music.m4a', urls: [host('song.m4a?sig=1')], fingerprint: `dy-m-${ID}`, estimate: 1228800 }])
  })

  it('没有任何能下的文件时报错', () => {
    expect(() => pickDouyin(work(undefined, { images: [image(1)] }), opts({ output: 'audio' }))).toThrow(t('dy.noStream'))
    expect(() => pickDouyin(work(undefined, { images: [{}] }), opts({ output: 'video' }))).toThrow(DyUnavailableError)
  })
})

describe('dyStreamInfo', () => {
  it('列出各清晰度和编码，最后是原画', () => {
    const video: DyVideo = {
      ...LADDER,
      bit_rate: [...LADDER.bit_rate!, rate(1080, { format: 'dash', HDR_type: '1' }), { format: 'mp4', play_addr: { url_list: [host('nosize')] } }],
      bit_rate_audio: [{ audio_meta: { url_list: { main_url: host('sound') } } }]
    }
    const none = { needVip: false, needLogin: false }
    expect(dyStreamInfo(work(video))).toEqual({
      qualities: [
        { qn: 1080, label: '1080p HDR', ...none, codecs: ['avc', 'hevc'] },
        { qn: 720, label: '720p', ...none, codecs: ['avc'] },
        { qn: 540, label: '540p', ...none, codecs: ['avc'] },
        { qn: DY_ORIGINAL_QN, label: t('dy.original'), ...none, codecs: [] }
      ],
      audios: [],
      hasAudio: true
    })
  })

  it('没有单独音轨时不列纯画面的档', () => {
    const video: DyVideo = { bit_rate: [rate(540), rate(1080, { format: 'dash' })] }
    expect(dyStreamInfo(work(video)).qualities.map((q) => q.qn)).toEqual([540])
  })

  it('分享页的作品和没有源文件标识的不提供原画', () => {
    expect(dyStreamInfo(work(LADDER, { fromShare: true })).qualities.map((q) => q.qn)).toEqual([1080, 720, 540])
    expect(dyStreamInfo(work({})).qualities).toEqual([])
  })

  it('图文没有画质可选', () => {
    expect(dyStreamInfo(work(LADDER, { images: [{}] }))).toEqual({ qualities: [], audios: [], hasAudio: false })
  })
})
