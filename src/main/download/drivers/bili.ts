import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { t as tr } from '@shared/i18n'
import type { TaskInfo } from '@shared/types'
import { getAudioStream } from '../../bili/audio'
import { BASE_HEADERS } from '../../bili/http'
import { getPlayInfo, isDolbyVision, isHevc, pickStreams, streamUrls, type DashStream } from '../../bili/playurl'
import { preferCdn } from '../../net/cdn'
import { AbortError } from '../errors'
import { prepareExtras } from '../extras'
import { fetchFile } from '../fetchFile'
import type { OutFormat } from '../mux'
import type { Acquired, PlatformDriver } from './types'

interface StreamPlan {
  parts: { name: string; urls: string[]; fingerprint: string; estimate: number }[]
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

export const biliDriver: PlatformDriver = {
  async acquire(t, ctx): Promise<Acquired> {
    const plan = await ctx.withAccount(() => planStreams(t, ctx.settings().cdn))
    if (ctx.signal.aborted) throw new AbortError()
    ctx.onPlanned({ qualityLabel: plan.qualityLabel, videoQn: plan.video?.id })
    mkdirSync(ctx.tmp, { recursive: true })

    const parts = plan.parts
    // 拿到真实大小之前先用估算值
    const sizes = parts.map((p) => p.estimate)
    const done = parts.map(() => 0)
    const report = (): void => ctx.onProgress(done.reduce((a, b) => a + b, 0), sizes.reduce((a, b) => a + b, 0))

    // 音视频两个文件同时下载，各自再分段
    await Promise.all(
      parts.map(async (part, i) => {
        const dest = join(ctx.tmp, part.name)
        if (!existsSync(dest)) {
          await fetchFile({
            urls: part.urls,
            dest,
            fingerprint: part.fingerprint,
            threads: ctx.settings().threads,
            headers: BASE_HEADERS,
            signal: ctx.signal,
            onProgress: (d, total) => {
              done[i] = d
              if (total) sizes[i] = total
              report()
            }
          })
        }
        done[i] = sizes[i] = statSync(dest).size
        report()
      })
    )
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
