import { ArrowUp } from 'lucide-react'
import type { CodecPref, Container, DanmakuFormat, DyOptions, OutputKind, StreamInfo } from '@shared/types'
import { useT } from '../i18n'
import { moveUp, type EditableOptions } from '../viewLogic'
import { Check, Section } from './OptionsEditor'
import { IconButton, Segmented, Select } from './ui'

export type DyEditable = EditableOptions & { dy: DyOptions }

const CODEC_LABEL: Record<CodecPref, string> = { avc: 'H.264', hevc: 'H.265', av1: 'AV1' }

/**
 * 抖音的下载选项（画质以外）。codecsForQuality 标出所选画质没有的编码；
 * images 表示选中的内容里有图文作品，设置页编辑默认值时两样都给
 */
export function DyOptionsEditor({
  value: o,
  onChange,
  info,
  codecsForQuality,
  images = true
}: {
  value: DyEditable
  onChange: (v: DyEditable) => void
  info?: StreamInfo | null
  codecsForQuality?: string[]
  images?: boolean
}) {
  const t = useT()
  const set = (patch: Partial<EditableOptions>): void => onChange({ ...o, ...patch })
  const setDy = (patch: Partial<DyOptions>): void => onChange({ ...o, dy: { ...o.dy, ...patch } })
  const audioOnly = o.output === 'audio'
  // 抖音没有 AV1，只让用户排 H.264 和 H.265 的顺序
  const codecs = o.codecOrder.filter((c) => c !== 'av1')
  const hasHdr = !info || info.qualities.some((q) => q.label.includes('HDR'))
  const outputs: { value: OutputKind; label: string; hint: string }[] = [
    { value: 'full', label: t('options.outputFull'), hint: t('options.outputFullHint') },
    { value: 'audio', label: t('options.outputAudio'), hint: t('dyUi.outputAudioHint') },
    { value: 'video', label: t('options.outputVideo'), hint: t('options.outputVideoHint') }
  ]

  return (
    <div className="flex flex-col gap-5">
      <Section title={t('options.content')}>
        <Segmented fill value={o.output} options={outputs} onChange={(output) => set({ output })} />
        <div className="mt-1.5 text-xs text-muted">{outputs.find((x) => x.value === o.output)?.hint}</div>
        <div className="mt-1 text-xs text-subtle">{t('dyUi.noSubtitleHint')}</div>
      </Section>

      <Section title={t('options.codecOrder')} dim={audioOnly}>
        <div className="flex flex-col gap-1">
          {codecs.map((c, i) => {
            const missing = codecsForQuality && !codecsForQuality.includes(c)
            return (
              <div key={c} className="flex h-8 items-center gap-2 rounded-lg border border-line bg-elevated pr-0.5 pl-2.5 text-xs">
                <span className="w-3 text-subtle tabular-nums">{i + 1}</span>
                <span className={`font-medium ${missing ? 'text-subtle line-through' : ''}`}>{CODEC_LABEL[c]}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{t(c === 'hevc' ? 'dyUi.codecHint_hevc' : 'dyUi.codecHint_avc')}</span>
                {i > 0 && (
                  <IconButton
                    icon={ArrowUp}
                    label={t('options.raisePriority')}
                    size="sm"
                    disabled={audioOnly}
                    onClick={() => set({ codecOrder: [...moveUp(codecs, i)!, 'av1'] })}
                  />
                )}
              </div>
            )
          })}
        </div>
        <label className={`mt-2 flex items-center gap-2 text-[13px] ${audioOnly || !hasHdr ? 'opacity-40' : 'cursor-pointer'}`}>
          <input type="checkbox" className="accent-bili" disabled={audioOnly || !hasHdr} checked={o.dy.hdr} onChange={(e) => setDy({ hdr: e.target.checked })} />
          {t('dyUi.preferHdr')}
        </label>
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

      {images && (
        <Section title={t('dyUi.imagesGroup')} dim={audioOnly}>
          <div className="grid grid-cols-2 gap-x-3">
            <Check checked={o.dy.live} disabled={audioOnly} onChange={(live) => setDy({ live })}>
              {t('dyUi.saveLive')}
            </Check>
            <Check checked={o.dy.music} disabled={audioOnly || o.output === 'video'} onChange={(music) => setDy({ music })}>
              {t('dyUi.saveMusic')}
            </Check>
          </div>
          <div className="mt-1 text-xs leading-relaxed text-muted">{t('dyUi.imagesHint')}</div>
        </Section>
      )}

      <Section title={t('options.extras')}>
        <div className="grid grid-cols-2 gap-x-3">
          <Check checked={o.embedCover} onChange={(embedCover) => set({ embedCover })}>
            {t('options.embedCover')}
          </Check>
          <Check checked={o.cover} onChange={(cover) => set({ cover })}>
            {t('options.cover')}
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
            <Select size="sm" value={o.danmakuFormat} onChange={(e) => set({ danmakuFormat: e.target.value as DanmakuFormat })} className="my-0.5">
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
