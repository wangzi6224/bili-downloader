import type { CodecPref, DownloadOptions } from './types'

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
  nfo: false
}

const CODECS: CodecPref[] = ['avc', 'hevc', 'av1']

/** 旧版任务/设置里的选项（codec、audioOnly）换算成当前格式，并补齐缺省字段 */
export function normalizeOptions(raw: Partial<DownloadOptions> & { codec?: CodecPref; audioOnly?: boolean }, qn = 127): DownloadOptions {
  const o = { ...DEFAULT_OPTIONS, qn, ...raw } as DownloadOptions & { codec?: CodecPref; audioOnly?: boolean }
  if (raw.codec && !raw.codecOrder) o.codecOrder = [raw.codec, ...CODECS.filter((c) => c !== raw.codec)]
  if (raw.audioOnly !== undefined && !raw.output) o.output = raw.audioOnly ? 'audio' : 'full'
  // 编码列表必须包含全部三种且不重复
  o.codecOrder = [...new Set([...(o.codecOrder ?? []).filter((c) => CODECS.includes(c)), ...CODECS])]
  delete o.codec
  delete o.audioOnly
  return o
}
