import type { ReactNode } from 'react'
import type { AudioPref, CodecPref, Container, DanmakuFormat, DownloadOptions, OutputKind, StreamInfo } from '@shared/types'

export type EditableOptions = Omit<DownloadOptions, 'qn'>

const CODEC_LABEL: Record<CodecPref, string> = { avc: 'AVC', hevc: 'HEVC', av1: 'AV1' }
const CODEC_HINT: Record<CodecPref, string> = { avc: '兼容性最好', hevc: '体积更小', av1: '最省空间，需 M1 以后的 Mac' }

const OUTPUTS: { value: OutputKind; label: string; hint: string }[] = [
  { value: 'full', label: '完整视频', hint: '画面和声音合成一个文件' },
  { value: 'audio', label: '仅音频', hint: '只保存声音（m4a，无损为 flac）' },
  { value: 'video', label: '仅视频（无声）', hint: '只保存画面，没有声音' }
]

const AUDIO_LABEL: Record<AudioPref, string> = {
  best: '最佳',
  flac: 'Hi-Res 无损',
  dolby: '杜比全景声',
  '192k': '192K',
  '132k': '132K',
  '64k': '64K'
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  disabled
}: {
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div
      className={`grid gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800 ${disabled ? 'opacity-40' : ''}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`truncate rounded-md px-1 py-1 text-xs ${value === o.value ? 'bg-white shadow dark:bg-neutral-700' : 'text-neutral-500'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Section({ title, children, dim }: { title: string; children: ReactNode; dim?: boolean }) {
  return (
    <section className={dim ? 'opacity-40' : ''}>
      <div className="mb-2 text-sm font-medium">{title}</div>
      {children}
    </section>
  )
}

function Check({
  checked,
  onChange,
  disabled,
  children
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <label className={`flex items-center gap-1.5 py-0.5 text-sm ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="accent-bili"
        disabled={disabled}
        checked={checked && !disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  )
}

/** 编码优先级：从上到下依次尝试 */
function CodecOrder({
  order,
  available,
  onChange,
  disabled
}: {
  order: CodecPref[]
  available?: CodecPref[]
  onChange: (o: CodecPref[]) => void
  disabled?: boolean
}) {
  const move = (i: number): void => {
    if (i === 0) return
    const next = [...order]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
  }
  const actual = available?.length ? order.find((c) => available.includes(c)) : undefined
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="flex flex-col gap-1">
        {order.map((c, i) => {
          const missing = available && !available.includes(c)
          return (
            <div
              key={c}
              className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700"
            >
              <span className="w-4 text-neutral-400 tabular-nums">{i + 1}</span>
              <span className={`font-medium ${missing ? 'text-neutral-400 line-through' : ''}`}>{CODEC_LABEL[c]}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-500">{CODEC_HINT[c]}</span>
              {i > 0 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => move(i)}
                  className="rounded px-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  title="提高优先级"
                >
                  ↑
                </button>
              )}
            </div>
          )
        })}
      </div>
      {actual && actual !== order[0] && (
        <div className="mt-1 text-xs text-amber-600">
          该清晰度没有 {CODEC_LABEL[order[0]]}，将下载 {CODEC_LABEL[actual]}
        </div>
      )}
    </div>
  )
}

/**
 * 下载选项（清晰度以外）。info 和 codecsForQuality 来自取流接口，用来标出哪些选项当前可用；
 * 在设置页编辑默认值时不传。
 */
export function OptionsEditor({
  value: o,
  onChange,
  info,
  codecsForQuality
}: {
  value: EditableOptions
  onChange: (v: EditableOptions) => void
  info?: StreamInfo | null
  codecsForQuality?: CodecPref[]
}) {
  const set = (patch: Partial<EditableOptions>): void => onChange({ ...o, ...patch })
  const audioOnly = o.output === 'audio'
  const noAudio = info ? !info.hasAudio : false
  const audioAvailable = (id: AudioPref): boolean => !info || (info.audios.find((a) => a.id === id)?.available ?? false)

  return (
    <div className="flex flex-col gap-5">
      <Section title="下载内容">
        <Seg value={o.output} options={OUTPUTS} onChange={(output) => set({ output })} />
        <div className="mt-1 text-xs text-neutral-500">{OUTPUTS.find((x) => x.value === o.output)?.hint}</div>
        {noAudio && o.output !== 'video' && <div className="mt-1 text-xs text-amber-600">这个视频没有独立音轨</div>}
      </Section>

      <Section title="编码优先级" dim={audioOnly}>
        <CodecOrder
          order={o.codecOrder}
          available={codecsForQuality}
          disabled={audioOnly}
          onChange={(codecOrder) => set({ codecOrder })}
        />
      </Section>

      <Section title="音质" dim={o.output === 'video' || noAudio}>
        <select
          value={o.audio}
          disabled={o.output === 'video' || noAudio}
          onChange={(e) => set({ audio: e.target.value as AudioPref })}
          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {(Object.keys(AUDIO_LABEL) as AudioPref[]).map((id) => (
            <option key={id} value={id} disabled={!audioAvailable(id)}>
              {AUDIO_LABEL[id]}
              {!audioAvailable(id) ? '（这个视频没有）' : ''}
            </option>
          ))}
        </select>
        <div className="mt-1 text-xs text-neutral-500">
          “最佳”：完整视频优先杜比（MKV 时优先无损），仅音频优先无损；指定档位没有时自动降档
        </div>
      </Section>

      <Section title="封装格式" dim={audioOnly}>
        <Seg<Container>
          value={o.container}
          disabled={audioOnly}
          onChange={(container) => set({ container })}
          options={[
            { value: 'mp4', label: 'MP4', hint: 'QuickTime、iPhone 都能直接播放' },
            { value: 'mkv', label: 'MKV', hint: '能放无损音轨，字幕和杜比视界兼容更好' }
          ]}
        />
      </Section>

      <Section title="附加内容">
        <div className="grid grid-cols-2 gap-x-3">
          <Check checked={o.embedCover} onChange={(embedCover) => set({ embedCover })}>
            封面写入文件
          </Check>
          <Check checked={o.cover} onChange={(cover) => set({ cover })}>
            封面另存图片
          </Check>
          <Check checked={o.embedSubtitle} disabled={audioOnly} onChange={(embedSubtitle) => set({ embedSubtitle })}>
            字幕写入视频
          </Check>
          <Check checked={o.subtitle} disabled={audioOnly} onChange={(subtitle) => set({ subtitle })}>
            字幕另存 .srt
          </Check>
          <Check checked={o.chapters} disabled={audioOnly} onChange={(chapters) => set({ chapters })}>
            章节（进度条分段）
          </Check>
          <Check checked={o.nfo} onChange={(nfo) => set({ nfo })}>
            NFO 元数据
          </Check>
          <Check checked={o.danmaku} disabled={audioOnly} onChange={(danmaku) => set({ danmaku })}>
            弹幕
          </Check>
          {o.danmaku && !audioOnly && (
            <select
              value={o.danmakuFormat}
              onChange={(e) => set({ danmakuFormat: e.target.value as DanmakuFormat })}
              className="my-0.5 rounded-md border border-neutral-300 bg-white px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="ass">ASS（播放器叠加）</option>
              <option value="xml">XML（原始）</option>
              <option value="both">ASS + XML</option>
            </select>
          )}
        </div>
        {o.nfo && <div className="mt-1 text-xs text-neutral-500">生成 Kodi / Jellyfin / Emby 能识别的 .nfo，番剧额外生成 tvshow.nfo 和海报</div>}
      </Section>
    </div>
  )
}

/** 底部“这次会下载什么”的标签，避免下完才发现没有声音 */
export function summaryTags(o: EditableOptions, info?: StreamInfo | null): string[] {
  const tags: string[] = []
  const hasAudio = !info || info.hasAudio
  if (o.output !== 'audio') tags.push(`视频（${o.container.toUpperCase()}）`)
  if (o.output !== 'video' && hasAudio) tags.push(`音频（${AUDIO_LABEL[o.audio]}）`)
  if (o.output === 'video') tags.push('无声')
  if (o.embedCover || o.cover) tags.push('封面')
  if (o.output !== 'audio') {
    if (o.embedSubtitle || o.subtitle) tags.push('字幕')
    if (o.chapters) tags.push('章节')
    if (o.danmaku) tags.push('弹幕')
  }
  if (o.nfo) tags.push('NFO')
  return tags
}
