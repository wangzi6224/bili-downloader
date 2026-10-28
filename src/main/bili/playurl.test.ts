import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@shared/types'
import type { DashStream, PickOptions, PlayInfo } from './playurl'

type Params = Record<string, unknown>
const api = vi.hoisted(() => vi.fn<(url: string, params?: Params, opts?: { wbi?: boolean }) => Promise<unknown>>())

vi.mock('electron', () => ({}))
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), api }))

const { AuthExpiredError, BiliError, UnsupportedError } = await import('./http')
const { getPlayInfo, isDolbyVision, isHevc, pickStreams, qualitiesFromInfo, streamInfoFromPlay, streamUrls } = await import('./playurl')

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

  it('没有 dash 时报不支持 FLV', () => {
    expect(() => pickStreams({ quality: 80, durl: [{}] }, base)).toThrow(UnsupportedError)
    expect(() => pickStreams({ quality: 80 }, base)).toThrow('该视频只有旧版 FLV 格式，暂不支持')
  })

  it('没有视频流时报错', () => {
    const info: PlayInfo = { quality: 80, dash: { video: [], audio: [a(30216, 67000)] } }
    expect(() => pickStreams(info, base)).toThrow('没有可用的视频流')
  })

  it('qn 低于所有档位时取最低档', () => {
    const p = pickStreams(INFO, { ...base, qn: 16 })
    expect(p.video?.id).toBe(64)
    expect(p.quality).toBe('720P 准高清')
    expect(p.qualityLabel).toBe('720P 准高清 · AVC')
  })

  it('没有匹配的编码时取该档第一条，认不出编码时用原始 codecs 文本', () => {
    const info: PlayInfo = { quality: 32, dash: { video: [{ id: 32, codecs: 'vp09.00.40.08', bandwidth: 1 }], audio: null } }
    const p = pickStreams(info, { ...base, output: 'video' })
    expect(p.video?.codecs).toBe('vp09.00.40.08')
    expect(p.codec).toBe('vp09.00.40.08')
    expect(p.quality).toBe('32')
    expect(p.notes).toEqual([])
  })

  it('偏好的音轨不存在时退回码率最高的 AAC', () => {
    const info: PlayInfo = { ...INFO, dash: { ...INFO.dash!, flac: null, dolby: null } }
    expect(pickStreams(info, { ...base, audio: 'flac' })).toMatchObject({ audioKind: 'aac', container: 'mp4' })
    expect(pickStreams(info, { ...base, audio: 'flac' }).audio?.id).toBe(30232)
    expect(pickStreams(info, { ...base, audio: 'dolby' }).audio?.id).toBe(30232)
    // best + MP4 没有杜比时也用 AAC
    expect(pickStreams(info, base).audio?.id).toBe(30232)
    // 仅音频且没有无损时用 AAC，标签写码率
    expect(pickStreams(info, { ...base, output: 'audio' })).toMatchObject({ audioKind: 'aac', qualityLabel: '音频 132K', codec: '' })
  })

  it('AAC 阶梯里一个档位都没有时取码率最高的', () => {
    const info: PlayInfo = { quality: 80, dash: { video: [v(80, 7, 'avc1')], audio: [a(30200, 50000), a(30201, 90000)] } }
    expect(pickStreams(info, { ...base, audio: '132k' }).audio?.id).toBe(30201)
  })

  it('仅音频选杜比时标签为杜比全景声', () => {
    expect(pickStreams(INFO, { ...base, output: 'audio', audio: 'dolby' })).toMatchObject({ audioKind: 'eac3', qualityLabel: '杜比全景声' })
  })

  it('没有任何音轨时：完整输出加提示，仅音频报错', () => {
    const info: PlayInfo = { quality: 80, dash: { video: [v(80, 7, 'avc1')], audio: null } }
    const full = pickStreams(info, base)
    expect(full.audio).toBeUndefined()
    expect(full.audioKind).toBe('aac')
    expect(full.notes).toContain('该视频没有独立音轨')
    expect(() => pickStreams(info, { ...base, output: 'audio' })).toThrow('该视频没有独立音轨')
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

  it('没有 dash 时没有音轨', () => {
    const s = streamInfoFromPlay({ quality: 80 })
    expect(s.hasAudio).toBe(false)
    expect(s.qualities).toEqual([])
    expect(s.audios.filter((x) => x.available).map((x) => x.id)).toEqual(['best'])
  })
})

describe('qualitiesFromInfo', () => {
  it('没有 support_formats 时用 accept_quality，按清晰度从高到低排', () => {
    const q = qualitiesFromInfo({
      quality: 80,
      accept_quality: [64, 116, 80],
      accept_description: ['720P', '1080P60'],
      dash: { video: [v(80, 7, 'avc1'), v(80, 7, 'avc1.2')], audio: null }
    })
    expect(q).toEqual([
      { qn: 116, label: '1080P60', needVip: true, needLogin: false, codecs: [] },
      { qn: 80, label: '80', needVip: false, needLogin: false, codecs: ['avc'] },
      { qn: 64, label: '720P', needVip: false, needLogin: false, codecs: [] }
    ])
  })

  it('标签依次回退到 display_desc 和数字，need_login 透传', () => {
    const q = qualitiesFromInfo({ quality: 32, support_formats: [{ quality: 32, display_desc: '480P', need_login: true }] })
    expect(q).toEqual([{ qn: 32, label: '480P', needVip: false, needLogin: true, codecs: [] }])
  })

  it('两个字段都没有时为空', () => {
    expect(qualitiesFromInfo({ quality: 0 })).toEqual([])
  })

  it('没有 codecid 或 codecid 不认识时按 codecs 字符串识别编码', () => {
    const s = (codecs: string, codecid?: number): DashStream => ({ id: 80, codecs, codecid, bandwidth: 1 })
    const q = qualitiesFromInfo({
      quality: 80,
      support_formats: [{ quality: 80 }],
      dash: { video: [s('avc1.640032'), s('hvc1.1.6'), s('dvh1.08.07', 99), s('av01.0.08M'), s('vp09.00')], audio: null }
    })
    expect(q[0].codecs).toEqual(['avc', 'hevc', 'av1'])
  })
})

describe('isHevc / isDolbyVision', () => {
  const s = (codecs: string, codecid?: number): DashStream => ({ id: 1, codecs, codecid, bandwidth: 1 })

  it('按 codecid 或 codecs 判断 HEVC', () => {
    expect(isHevc(s('whatever', 12))).toBe(true)
    expect(isHevc(s('hev1.1.6'))).toBe(true)
    expect(isHevc(s('dvh1.08.07'))).toBe(true)
    expect(isHevc(s('avc1.64'))).toBe(false)
    expect(isHevc(s('avc1.64', 13))).toBe(false)
  })

  it('只有 dvh 开头才是杜比视界', () => {
    expect(isDolbyVision(s('dvh1.08.07'))).toBe(true)
    expect(isDolbyVision(s('hev1.1.6', 12))).toBe(false)
  })
})

describe('streamUrls', () => {
  it('主地址在前，兼容两种命名，过滤空值', () => {
    expect(streamUrls({ id: 1, codecs: '', bandwidth: 1, baseUrl: 'a', backupUrl: ['b', ''] })).toEqual(['a', 'b'])
    expect(streamUrls({ id: 1, codecs: '', bandwidth: 1, base_url: 'c', backup_url: ['d'] })).toEqual(['c', 'd'])
    expect(streamUrls({ id: 1, codecs: '', bandwidth: 1, baseUrl: 'e', backupUrl: null })).toEqual(['e'])
  })
})

describe('getPlayInfo', () => {
  const item = (kind: MediaItem['kind']): MediaItem => ({ key: 'k', kind, title: 't', index: 1, cid: 2, bvid: 'BV1', aid: 3, epId: 4 })
  const PARAMS = { fnval: 4048, fnver: 0, fourk: 1 }
  const OK: PlayInfo = { quality: 80, dash: { video: [], audio: null } }

  beforeEach(() => {
    api.mockReset().mockResolvedValue(OK)
  })

  it('ugc 走 WBI 签名的播放接口', async () => {
    expect(await getPlayInfo(item('ugc'), 80)).toBe(OK)
    expect(api).toHaveBeenCalledWith('https://api.bilibili.com/x/player/wbi/playurl', { bvid: 'BV1', cid: 2, qn: 80, ...PARAMS }, { wbi: true })
  })

  it('audio 直接抛 UnsupportedError', async () => {
    await expect(getPlayInfo(item('audio'), 80)).rejects.toSatisfy(
      (e) => e instanceof UnsupportedError && e.message === '音频不走视频取流接口'
    )
    expect(api).not.toHaveBeenCalled()
  })

  describe('cheese', () => {
    it('按 avid / cid / ep_id 请求课程播放接口', async () => {
      expect(await getPlayInfo(item('cheese'), 64)).toBe(OK)
      expect(api).toHaveBeenCalledWith('https://api.bilibili.com/pugv/player/web/playurl', { avid: 3, cid: 2, ep_id: 4, qn: 64, ...PARAMS })
    })

    it('没有权限的错误转成 UnsupportedError，保留错误码', async () => {
      api.mockRejectedValue(new BiliError('需要购买', -403))
      const err = await getPlayInfo(item('cheese'), 80).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(UnsupportedError)
      expect(err).toMatchObject({ code: -403, message: '没有这节课的观看权限（可能需要购买）：需要购买' })
    })

    it.each([87008, 6002003, 404])('业务错误码 %i（哪怕是很大的正数）也算没有权限（回归）', async (code) => {
      api.mockRejectedValue(new BiliError('无权访问', code))
      await expect(getPlayInfo(item('cheese'), 80)).rejects.toSatisfy((e) => e instanceof UnsupportedError && (e as InstanceType<typeof BiliError>).code === code)
    })

    it('登录过期原样抛出，任务会等重新登录而不是标成无法下载（回归）', async () => {
      const e = new AuthExpiredError()
      api.mockRejectedValue(e)
      await expect(getPlayInfo(item('cheese'), 80)).rejects.toBe(e)
    })

    it.each([-1, 412, 500, 503])('错误码 %i 原样抛出，可以重试', async (code) => {
      const e = new BiliError('临时错误', code)
      api.mockRejectedValue(e)
      await expect(getPlayInfo(item('cheese'), 80)).rejects.toBe(e)
    })

    it('不是 BiliError 的错误原样抛出', async () => {
      const e = new TypeError('坏数据')
      api.mockRejectedValue(e)
      await expect(getPlayInfo(item('cheese'), 80)).rejects.toBe(e)
    })

    it.each<[string, Partial<PlayInfo>, string]>([
      ['is_drm', { is_drm: true }, '这节课使用了 DRM 加密，不支持下载'],
      ['drm_type', { drm_type: 1 }, '这节课使用了 DRM 加密，不支持下载'],
      ['试看', { is_preview: 1 }, '当前账号只能试看这节课（需要购买）']
    ])('%s 时抛 UnsupportedError', async (_, extra, message) => {
      api.mockResolvedValue({ ...OK, ...extra })
      await expect(getPlayInfo(item('cheese'), 80)).rejects.toSatisfy((e) => e instanceof UnsupportedError && e.message === message)
    })
  })

  describe('pgc', () => {
    const PGC = 'https://api.bilibili.com/pgc/player/web/v2/playurl'

    it('按 ep_id / cid 请求，并解开 video_info', async () => {
      const inner: PlayInfo = { quality: 112, dash: { video: [], audio: null } }
      api.mockResolvedValue({ video_info: inner, play_check: { play_detail: 'PLAY_WHOLE' } })
      expect(await getPlayInfo(item('pgc'), 112)).toBe(inner)
      expect(api).toHaveBeenCalledWith(PGC, { ep_id: 4, cid: 2, qn: 112, ...PARAMS })
    })

    it('没有 video_info 时直接用外层', async () => {
      expect(await getPlayInfo(item('pgc'), 80)).toBe(OK)
    })

    it.each([
      [-10403, '抱歉您所在地区不可观看！', '地区限制：抱歉您所在地区不可观看！'],
      [6002003, '大会员专享', '需要大会员：大会员专享'],
      [-10403, '大会员专享限制', '需要大会员：大会员专享限制']
    ])('错误码 %i 转成带提示的 UnsupportedError', async (code, message, expected) => {
      api.mockRejectedValue(new BiliError(message, code))
      const err = await getPlayInfo(item('pgc'), 80).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(UnsupportedError)
      expect(err).toMatchObject({ code, message: expected })
    })

    it('其他错误原样抛出', async () => {
      const e = new BiliError('风控', 412)
      api.mockRejectedValue(e)
      await expect(getPlayInfo(item('pgc'), 80)).rejects.toBe(e)
    })

    it.each<[string, Record<string, unknown>, string]>([
      ['video_info.is_drm', { video_info: { ...OK, is_drm: true } }, 'DRM'],
      ['video_info.drm_type', { video_info: { ...OK, drm_type: 2 } }, 'DRM'],
      ['外层 drm_type', { video_info: OK, drm_type: 2 }, 'DRM'],
      ['is_preview', { ...OK, is_preview: 1 }, '试看'],
      ['play_check 为试看', { video_info: OK, play_check: { play_detail: 'PLAY_PREVIEW' } }, '试看']
    ])('%s 时抛 UnsupportedError', async (_, r, keyword) => {
      api.mockResolvedValue(r)
      await expect(getPlayInfo(item('pgc'), 80)).rejects.toSatisfy((e) => e instanceof UnsupportedError && e.message.includes(keyword))
    })
  })
})
