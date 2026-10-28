import type { ReactNode } from 'react'
import { ArrowUp } from 'lucide-react'
import type { AudioPref, CodecPref, Container, DanmakuFormat, OutputKind, StreamInfo } from '@shared/types'
import { actualCodec, AUDIO_LABEL, moveUp, type EditableOptions } from '../viewLogic'
import { IconButton, Segmented, Select } from './ui'

const CODEC_LABEL: Record<CodecPref, string> = { avc: 'AVC', hevc: 'HEVC', av1: 'AV1' }
const CODEC_HINT: Record<CodecPref, string> = { avc: '兼容性最好', hevc: '体积更小', av1: '最省空间，需 M1 以后的 Mac' }

const OUTPUTS: { value: OutputKind; label: string; hint: string }[] = [
  { value: 'full', label: '完整视频', hint: '画面和声音合成一个文件' },
  { value: 'audio', label: '仅音频', hint: '只保存声音（m4a，无损为 flac）' },
  { value: 'video', label: '仅视频', hint: '只保存画面，没有声音' }
]

export function Section({ title, children, dim }: { title: string; children: ReactNode; dim?: boolean }) {
  return (
    <section className={`transition-opacity ${dim ? 'opacity-40' : ''}`}>
      <div className="mb-2 text-xs font-medium text-muted">{title}</div>
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
    <label className={`flex items-center gap-2 py-1 text-[13px] ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
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
    const next = moveUp(order, i)
    if (next) onChange(next)
  }
  const actual = actualCodec(order, available)
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="flex flex-col gap-1">
        {order.map((c, i) => {
          const missing = available && !available.includes(c)
          return (
            <div
              key={c}
              className="flex h-8 items-center gap-2 rounded-lg border border-line bg-elevated pr-0.5 pl-2.5 text-xs"
            >
              <span className="w-3 text-subtle tabular-nums">{i + 1}</span>
              <span className={`font-medium ${missing ? 'text-subtle line-through' : ''}`}>{CODEC_LABEL[c]}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{CODEC_HINT[c]}</span>
              {i > 0 && <IconButton icon={ArrowUp} label="提高优先级" size="sm" disabled={disabled} onClick={() => move(i)} />}
            </div>
          )
        })}
      </div>
      {actual && actual !== order[0] && (
        <div className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
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
        <Segmented fill value={o.output} options={OUTPUTS} onChange={(output) => set({ output })} />
        <div className="mt-1.5 text-xs text-muted">{OUTPUTS.find((x) => x.value === o.output)?.hint}</div>
        {noAudio && o.output !== 'video' && <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">这个视频没有独立音轨</div>}
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
        <Select
          value={o.audio}
          disabled={o.output === 'video' || noAudio}
          onChange={(e) => set({ audio: e.target.value as AudioPref })}
          className="w-full"
        >
          {(Object.keys(AUDIO_LABEL) as AudioPref[]).map((id) => (
            <option key={id} value={id} disabled={!audioAvailable(id)}>
              {AUDIO_LABEL[id]}
              {!audioAvailable(id) ? '（这个视频没有）' : ''}
            </option>
          ))}
        </Select>
        <div className="mt-1.5 text-xs leading-relaxed text-muted">
          “最佳”：完整视频优先杜比（MKV 时优先无损），仅音频优先无损；指定档位没有时自动降档
        </div>
      </Section>

      <Section title="封装格式" dim={audioOnly}>
        <Segmented<Container>
          fill
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
            <Select
              size="sm"
              value={o.danmakuFormat}
              onChange={(e) => set({ danmakuFormat: e.target.value as DanmakuFormat })}
              className="my-0.5"
            >
              <option value="ass">ASS（播放器叠加）</option>
              <option value="xml">XML（原始）</option>
              <option value="both">ASS + XML</option>
            </Select>
          )}
        </div>
        {o.nfo && <div className="mt-1 text-xs leading-relaxed text-muted">生成 Kodi / Jellyfin / Emby 能识别的 .nfo，番剧额外生成 tvshow.nfo 和海报</div>}
      </Section>
    </div>
  )
}
