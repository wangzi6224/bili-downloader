import { join } from 'node:path'
import { t as tr } from '@shared/i18n'
import type { TaskInfo } from '@shared/types'
import { getAudioStream } from '../../bili/audio'
import { BASE_HEADERS } from '../../bili/http'
import { getPlayInfo, isDolbyVision, isHevc, pickStreams, streamUrls, type DashStream } from '../../bili/playurl'
import { preferCdn } from '../../net/cdn'
import { AbortError } from '../errors'
import { prepareExtras } from '../extras'
import type { OutFormat } from '../mux'
import { fetchParts, type DirectPart } from './direct'
import type { AvAcquired, AvDriver } from './types'

interface StreamPlan {
  parts: DirectPart[]
  video?: DashStream
  hasAudio: boolean
  format: OutFormat
  qualityLabel: string
  quality: string
  codec: string
  notes: string[]
}

/** 决定要下载哪些流：音频区直接取音频地址，视频走 DASH 选流 */
async function planStreams(t: TaskInfo, cdn: string): Promise<StreamPlan> {
  if (t.item.kind === 'audio') {
    const s = await getAudioStream(t.item.cid, t.options.audio)
    return {
      parts: [{ name: 'audio.m4s', urls: s.urls, fingerprint: `au-${s.label}-${s.size}`, estimate: s.size }],
      hasAudio: true,
      format: s.flac ? 'flac' : 'm4a',
      qualityLabel: tr('bili.audioQuality', { label: s.text }),
      quality: s.label,
      codec: '',
      notes: []
    }
  }
  const pick = pickStreams(await getPlayInfo(t.item, t.options.qn), t.options)
  const estimate = (s: DashStream): number => Math.round((s.bandwidth * (t.item.duration ?? 0)) / 8)
  const part = (name: string, s: DashStream) => ({
    name,
    urls: preferCdn(streamUrls(s), cdn),
    fingerprint: `${s.id}-${s.codecs}-${s.bandwidth}`,
    estimate: estimate(s)
  })
  return {
    parts: [...(pick.video ? [part('video.m4s', pick.video)] : []), ...(pick.audio ? [part('audio.m4s', pick.audio)] : [])],
    video: pick.video,
    hasAudio: Boolean(pick.audio),
    format: pick.video ? pick.container : pick.audioKind === 'flac' ? 'flac' : 'm4a',
    qualityLabel: pick.qualityLabel,
    quality: pick.quality,
    codec: pick.codec,
    notes: pick.notes
  }
}

export const biliDriver: AvDriver = {
  async acquire(t, ctx): Promise<AvAcquired> {
    const plan = await ctx.withAccount(() => planStreams(t, ctx.settings().cdn))
    if (ctx.signal.aborted) throw new AbortError()
    ctx.onPlanned({ qualityLabel: plan.qualityLabel, videoQn: plan.video?.id })
    // 音视频两个文件同时下载，各自再分段
    await fetchParts(plan.parts, ctx, { headers: BASE_HEADERS })
    return {
      video: plan.video ? join(ctx.tmp, 'video.m4s') : undefined,
      audio: plan.hasAudio ? join(ctx.tmp, 'audio.m4s') : undefined,
      format: plan.format,
      qualityLabel: plan.qualityLabel,
      quality: plan.quality,
      codec: plan.codec,
      notes: plan.notes,
      hevc: plan.video ? isHevc(plan.video) : false,
      dolbyVision: plan.video ? isDolbyVision(plan.video) : false,
      wmStream: plan.video
    }
  },

  extras(t, ctx) {
    const audioOnly = t.options.output === 'audio' || t.item.kind === 'audio'
    // 字幕、章节要用账号的会话取
    const needsAuth = !audioOnly && (t.options.subtitle || t.options.embedSubtitle || t.options.chapters)
    return needsAuth ? ctx.withAccount(() => prepareExtras(t, ctx.tmp, ctx.settings())) : prepareExtras(t, ctx.tmp, ctx.settings())
  },

  sourceUrl(t) {
    return t.item.bvid ? `https://www.bilibili.com/video/${t.item.bvid}` : t.meta?.url
  }
}
