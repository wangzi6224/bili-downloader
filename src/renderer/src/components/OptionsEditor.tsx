import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUp, Download, X } from 'lucide-react'
import type { AiModelStatus, AudioPref, CodecPref, Container, DanmakuFormat, OutputKind, StreamInfo, WatermarkMode } from '@shared/types'
import { t } from '@shared/i18n'
import { modelPct, modelText, WATERMARK_MODES } from '../aiRefine'
import { useT } from '../i18n'
import { api, sysText } from '../store'
import { actualCodec, AUDIO_LABEL, moveUp, type EditableOptions } from '../viewLogic'
import { Button, IconButton, Progress, Segmented, Select } from './ui'

/** 选了 AI 精修时：模型下载好没有，没下载可以先下好 */
function AiModelLine() {
  const t = useT()
  const [m, setM] = useState<AiModelStatus | null>(null)
  useEffect(() => {
    void api.watermark.aiStatus().then(setM)
    return api.watermark.onAiStatus(setM)
  }, [])
  if (!m || m.state === 'ready') return null
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
      <div className="min-w-0 flex-1">
        <div>{m.state === 'missing' ? t('options.modelMissing', { text: modelText(m) }) : modelText(m)}</div>
        {m.state === 'downloading' && <Progress value={modelPct(m)} className="mt-1" />}
      </div>
      {m.state === 'downloading' ? (
        <Button size="sm" variant="ghost" icon={X} disabled={m.verifying} onClick={() => void api.watermark.aiCancelDownload()}>
          {t('options.cancel')}
        </Button>
      ) : (
        <Button size="sm" icon={Download} onClick={() => void api.watermark.aiDownload()}>
          {m.state === 'error' ? t('options.retry') : t('options.downloadModel')}
        </Button>
      )}
    </div>
  )
}

const CODEC_LABEL: Record<CodecPref, string> = { avc: 'AVC', hevc: 'HEVC', av1: 'AV1' }
// 文案在渲染时取，切换语言后跟着变
const codecHint = (c: CodecPref): string =>
  c === 'avc' ? t('options.codecAvcHint') : c === 'hevc' ? t('options.codecHevcHint') : sysText.av1Hint

const outputs = (): { value: OutputKind; label: string; hint: string }[] => [
  { value: 'full', label: t('options.outputFull'), hint: t('options.outputFullHint') },
  { value: 'audio', label: t('options.outputAudio'), hint: t('options.outputAudioHint') },
  { value: 'video', label: t('options.outputVideo'), hint: t('options.outputVideoHint') }
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
  const t = useT()
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
              <span className="min-w-0 flex-1 truncate text-muted">{codecHint(c)}</span>
              {i > 0 && <IconButton icon={ArrowUp} label={t('options.raisePriority')} size="sm" disabled={disabled} onClick={() => move(i)} />}
            </div>
          )
        })}
      </div>
      {actual && actual !== order[0] && (
        <div className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
          {t('options.codecFallback', { wanted: CODEC_LABEL[order[0]], actual: CODEC_LABEL[actual] })}
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
  const t = useT()
  const set = (patch: Partial<EditableOptions>): void => onChange({ ...o, ...patch })
  const outputOptions = outputs()
  const audioOnly = o.output === 'audio'
  const noAudio = info ? !info.hasAudio : false
  const audioAvailable = (id: AudioPref): boolean => !info || (info.audios.find((a) => a.id === id)?.available ?? false)

  return (
    <div className="flex flex-col gap-5">
      <Section title={t('options.content')}>
        <Segmented fill value={o.output} options={outputOptions} onChange={(output) => set({ output })} />
        <div className="mt-1.5 text-xs text-muted">{outputOptions.find((x) => x.value === o.output)?.hint}</div>
        {noAudio && o.output !== 'video' && (
          <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t('options.noAudioTrack')}</div>
        )}
      </Section>

      <Section title={t('options.codecOrder')} dim={audioOnly}>
        <CodecOrder
          order={o.codecOrder}
          available={codecsForQuality}
          disabled={audioOnly}
          onChange={(codecOrder) => set({ codecOrder })}
        />
      </Section>

      <Section title={t('options.audio')} dim={o.output === 'video' || noAudio}>
        <Select
          value={o.audio}
          disabled={o.output === 'video' || noAudio}
          onChange={(e) => set({ audio: e.target.value as AudioPref })}
          className="w-full"
        >
          {(Object.keys(AUDIO_LABEL) as AudioPref[]).map((id) => (
            <option key={id} value={id} disabled={!audioAvailable(id)}>
              {AUDIO_LABEL[id]}
              {!audioAvailable(id) ? t('options.audioUnavailable') : ''}
            </option>
          ))}
        </Select>
        <div className="mt-1.5 text-xs leading-relaxed text-muted">{t('options.audioHint')}</div>
      </Section>

      <Section title={t('options.container')} dim={audioOnly}>
        <Segmented<Container>
          fill
          value={o.container}
          disabled={audioOnly}
          onChange={(container) => set({ container })}
          options={[
            { value: 'mp4', label: 'MP4', hint: t('options.mp4Hint') },
            { value: 'mkv', label: 'MKV', hint: t('options.mkvHint') }
          ]}
        />
      </Section>

      <Section title={t('options.watermark')} dim={audioOnly}>
        <Segmented<WatermarkMode> fill value={o.watermark} disabled={audioOnly} onChange={(watermark) => set({ watermark })} options={WATERMARK_MODES} />
        {o.watermark === 'auto' && !audioOnly && (
          <div className="mt-1.5 text-xs leading-relaxed text-muted">{t('options.watermarkAutoHint')}</div>
        )}
        {o.watermark === 'ai' && !audioOnly && (
          <>
            <div className="mt-1.5 text-xs leading-relaxed text-muted">{t('options.watermarkAiHint')}</div>
            <AiModelLine />
          </>
        )}
      </Section>

      <Section title={t('options.extras')}>
        <div className="grid grid-cols-2 gap-x-3">
          <Check checked={o.embedCover} onChange={(embedCover) => set({ embedCover })}>
            {t('options.embedCover')}
          </Check>
          <Check checked={o.cover} onChange={(cover) => set({ cover })}>
            {t('options.cover')}
          </Check>
          <Check checked={o.embedSubtitle} disabled={audioOnly} onChange={(embedSubtitle) => set({ embedSubtitle })}>
            {t('options.embedSubtitle')}
          </Check>
          <Check checked={o.subtitle} disabled={audioOnly} onChange={(subtitle) => set({ subtitle })}>
            {t('options.subtitle')}
          </Check>
          <Check checked={o.chapters} disabled={audioOnly} onChange={(chapters) => set({ chapters })}>
            {t('options.chapters')}
          </Check>
          <Check checked={o.nfo} onChange={(nfo) => set({ nfo })}>
            {t('options.nfo')}
          </Check>
          <Check checked={o.danmaku} disabled={audioOnly} onChange={(danmaku) => set({ danmaku })}>
            {t('options.danmaku')}
          </Check>
          {o.danmaku && !audioOnly && (
            <Select
              size="sm"
              value={o.danmakuFormat}
              onChange={(e) => set({ danmakuFormat: e.target.value as DanmakuFormat })}
              className="my-0.5"
            >
              <option value="ass">{t('options.danmakuAss')}</option>
              <option value="xml">{t('options.danmakuXml')}</option>
              <option value="both">ASS + XML</option>
            </Select>
          )}
        </div>
        {o.nfo && <div className="mt-1 text-xs leading-relaxed text-muted">{t('options.nfoHint')}</div>}
      </Section>
    </div>
  )
}
