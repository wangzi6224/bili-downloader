import type { CodecPref, DownloadOptions, DyOptions, YtCodec, YtOptions } from './types'

export const DEFAULT_OPTIONS: Omit<DownloadOptions, 'qn'> = {
  codecOrder: ['avc', 'hevc', 'av1'],
  audio: 'best',
  output: 'full',
  container: 'mp4',
  cover: false,
  embedCover: true,
  subtitle: true,
  embedSubtitle: false,
  danmaku: false,
  danmakuFormat: 'ass',
  chapters: true,
  nfo: false,
  watermark: 'off'
}

const CODECS: CodecPref[] = ['avc', 'hevc', 'av1']

export const DEFAULT_YT_OPTIONS: YtOptions = {
  // 兼容性最好的放前面：AVC 几乎所有播放器都能放；最高只有 1080P，更高的画质会自动用 VP9 / AV1
  codecOrder: ['avc', 'vp9', 'av1'],
  audio: 'best',
  container: 'mp4',
  subtitleLangs: [],
  autoSubs: false,
  sponsorblock: 'off',
  hdr: false
}

const YT_CODECS: YtCodec[] = ['avc', 'vp9', 'av1']

/** 抖音画质选项里的“原画”：上传的源文件，比各清晰度档大很多 */
export const DY_ORIGINAL_QN = 100_000

export const DEFAULT_DY_OPTIONS: DyOptions = { live: true, music: true, hdr: false }

export function normalizeDyOptions(raw?: Partial<DyOptions>): DyOptions {
  const o = { ...DEFAULT_DY_OPTIONS, ...raw }
  return { live: Boolean(o.live), music: Boolean(o.music), hdr: Boolean(o.hdr) }
}

/** 补齐 YouTube 选项的缺省字段，丢掉不认识的取值 */
export function normalizeYtOptions(raw?: Partial<YtOptions>): YtOptions {
  const o = { ...DEFAULT_YT_OPTIONS, ...raw }
  return {
    codecOrder: [...new Set([...(o.codecOrder ?? []).filter((c) => YT_CODECS.includes(c)), ...YT_CODECS])],
    audio: ['best', 'opus', 'aac'].includes(o.audio) ? o.audio : 'best',
    container: ['mp4', 'mkv', 'webm'].includes(o.container) ? o.container : 'mp4',
    subtitleLangs: Array.isArray(o.subtitleLangs)
      ? [...new Set(o.subtitleLangs.filter((l): l is string => typeof l === 'string' && /^[A-Za-z0-9-]{1,20}$/.test(l)))]
      : [],
    autoSubs: Boolean(o.autoSubs),
    sponsorblock: o.sponsorblock === 'mark' ? 'mark' : 'off',
    hdr: Boolean(o.hdr)
  }
}

/** 旧版任务/设置里的选项（codec、audioOnly）换算成当前格式，并补齐缺省字段 */
export function normalizeOptions(raw: Partial<DownloadOptions> & { codec?: CodecPref; audioOnly?: boolean }, qn = 127): DownloadOptions {
  const o = { ...DEFAULT_OPTIONS, qn, ...raw } as DownloadOptions & { codec?: CodecPref; audioOnly?: boolean }
  if (raw.codec && !raw.codecOrder) o.codecOrder = [raw.codec, ...CODECS.filter((c) => c !== raw.codec)]
  if (raw.audioOnly !== undefined && !raw.output) o.output = raw.audioOnly ? 'audio' : 'full'
  // 编码列表必须包含全部三种且不重复
  o.codecOrder = [...new Set([...(o.codecOrder ?? []).filter((c) => CODECS.includes(c)), ...CODECS])]
  if (o.watermark !== 'auto' && o.watermark !== 'ai') o.watermark = 'off'
  if (raw.yt) o.yt = normalizeYtOptions(raw.yt)
  if (raw.dy) o.dy = normalizeDyOptions(raw.dy)
  delete o.codec
  delete o.audioOnly
  return o
}
