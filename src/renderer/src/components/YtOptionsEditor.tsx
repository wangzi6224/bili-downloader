import { useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { t } from '@shared/i18n'
import type { OutputKind, SponsorBlockMode, StreamInfo, YtAudioPref, YtCodec, YtContainer, YtOptions } from '@shared/types'
import { useT } from '../i18n'
import { moveUp, type EditableOptions } from '../viewLogic'
import { parseLangList } from '../ytView'
import { Check, Section } from './OptionsEditor'
import { fieldCls, IconButton, Segmented, Select } from './ui'

export type YtEditable = EditableOptions & { yt: YtOptions }

const CODEC_LABEL: Record<YtCodec, string> = { avc: 'AVC', vp9: 'VP9', av1: 'AV1' }
const codecHint = (c: YtCodec): string => t(`ytUi.codecHint_${c}` as 'ytUi.codecHint_avc')

/** YouTube 的下载选项（画质以外）。info 来自取流，标出哪些选项当前可用；设置页编辑默认值时不传 */
export function YtOptionsEditor({
  value: o,
  onChange,
  info,
  codecsForQuality
}: {
  value: YtEditable
  onChange: (v: YtEditable) => void
  info?: StreamInfo | null
  codecsForQuality?: string[]
}) {
  const t = useT()
  const set = (patch: Partial<EditableOptions>): void => onChange({ ...o, ...patch })
  const setYt = (patch: Partial<YtOptions>): void => onChange({ ...o, yt: { ...o.yt, ...patch } })
  const [langText, setLangText] = useState(o.yt.subtitleLangs.join(', '))
  const audioOnly = o.output === 'audio'
  const noAudio = info ? !info.hasAudio : false
  const audioAvailable = (id: YtAudioPref): boolean => !info?.yt || (info.yt.audios.find((a) => a.id === id)?.available ?? false)
  const subs = info?.yt?.subtitles ?? []
  const toggleLang = (lang: string): void => {
    const next = o.yt.subtitleLangs.includes(lang) ? o.yt.subtitleLangs.filter((l) => l !== lang) : [...o.yt.subtitleLangs, lang]
    setLangText(next.join(', '))
    setYt({ subtitleLangs: next })
  }
  const outputs: { value: OutputKind; label: string; hint: string }[] = [
    { value: 'full', label: t('options.outputFull'), hint: t('options.outputFullHint') },
    { value: 'audio', label: t('options.outputAudio'), hint: t('ytUi.outputAudioHint') },
    { value: 'video', label: t('options.outputVideo'), hint: t('options.outputVideoHint') }
  ]

  return (
    <div className="flex flex-col gap-5">
      <Section title={t('options.content')}>
        <Segmented fill value={o.output} options={outputs} onChange={(output) => set({ output })} />
        <div className="mt-1.5 text-xs text-muted">{outputs.find((x) => x.value === o.output)?.hint}</div>
        {noAudio && o.output !== 'video' && (
          <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t('options.noAudioTrack')}</div>
        )}
      </Section>

      <Section title={t('options.codecOrder')} dim={audioOnly}>
        <div className="flex flex-col gap-1">
          {o.yt.codecOrder.map((c, i) => {
            const missing = codecsForQuality && !codecsForQuality.includes(c)
            return (
              <div key={c} className="flex h-8 items-center gap-2 rounded-lg border border-line bg-elevated pr-0.5 pl-2.5 text-xs">
                <span className="w-3 text-subtle tabular-nums">{i + 1}</span>
                <span className={`font-medium ${missing ? 'text-subtle line-through' : ''}`}>{CODEC_LABEL[c]}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{codecHint(c)}</span>
                {i > 0 && (
                  <IconButton
                    icon={ArrowUp}
                    label={t('options.raisePriority')}
                    size="sm"
                    disabled={audioOnly}
                    onClick={() => setYt({ codecOrder: moveUp(o.yt.codecOrder, i)! })}
                  />
                )}
              </div>
            )
          })}
        </div>
        <label className={`mt-2 flex items-center gap-2 text-[13px] ${audioOnly || info?.yt?.hdr === false ? 'opacity-40' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            className="accent-bili"
            disabled={audioOnly || info?.yt?.hdr === false}
            checked={o.yt.hdr}
            onChange={(e) => setYt({ hdr: e.target.checked })}
          />
          {t('ytUi.preferHdr')}
        </label>
      </Section>

      <Section title={t('options.audio')} dim={o.output === 'video' || noAudio}>
        <Select
          value={o.yt.audio}
          disabled={o.output === 'video' || noAudio}
          onChange={(e) => setYt({ audio: e.target.value as YtAudioPref })}
          className="w-full"
        >
          {(['best', 'opus', 'aac'] as const).map((id) => (
            <option key={id} value={id} disabled={!audioAvailable(id)}>
              {t(`ytUi.audio_${id}`)}
              {!audioAvailable(id) ? t('options.audioUnavailable') : ''}
            </option>
          ))}
        </Select>
        {audioOnly && <div className="mt-1.5 text-xs leading-relaxed text-muted">{t('ytUi.audioOnlyFormat')}</div>}
      </Section>

      <Section title={t('options.container')} dim={audioOnly}>
        <Segmented<YtContainer>
          fill
          value={o.yt.container}
          disabled={audioOnly}
          onChange={(container) => setYt({ container })}
          options={[
            { value: 'mp4', label: 'MP4', hint: t('options.mp4Hint') },
            { value: 'mkv', label: 'MKV', hint: t('options.mkvHint') },
            { value: 'webm', label: 'WebM', hint: t('ytUi.webmHint') }
          ]}
        />
      </Section>

      <Section title={t('ytUi.subtitles')} dim={audioOnly}>
        <div className="grid grid-cols-2 gap-x-3">
          <Check checked={o.embedSubtitle} disabled={audioOnly} onChange={(embedSubtitle) => set({ embedSubtitle })}>
            {t('options.embedSubtitle')}
          </Check>
          <Check checked={o.subtitle} disabled={audioOnly} onChange={(subtitle) => set({ subtitle })}>
            {t('options.subtitle')}
          </Check>
        </div>
        {(o.subtitle || o.embedSubtitle) && !audioOnly && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {subs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {subs.map((s) => {
                  const on = o.yt.subtitleLangs.includes(s.lang)
                  return (
                    <button
                      key={s.lang}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleLang(s.lang)}
                      className={`rounded-md px-2 py-0.5 text-xs transition-colors ${on ? 'bg-bili text-white' : 'bg-track text-muted hover:bg-bili/15 hover:text-bili-dark dark:hover:text-bili'}`}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
            )}
            <input
              value={langText}
              onChange={(e) => {
                setLangText(e.target.value)
                setYt({ subtitleLangs: parseLangList(e.target.value) })
              }}
              placeholder={t('ytUi.subtitleLangsPlaceholder')}
              aria-label={t('ytUi.subtitleLangs')}
              className={`${fieldCls} h-7 px-2 text-xs`}
            />
            <div className="text-xs leading-relaxed text-muted">{t('ytUi.subtitleLangsHint')}</div>
            <Check checked={o.yt.autoSubs} onChange={(autoSubs) => setYt({ autoSubs })}>
              {t('ytUi.autoSubs')}
            </Check>
            {info?.yt && !subs.length && !info.yt.autoLang && <div className="text-xs text-amber-600 dark:text-amber-400">{t('ytUi.noSubsHere')}</div>}
          </div>
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
          <Check checked={o.chapters} disabled={audioOnly} onChange={(chapters) => set({ chapters })}>
            {t('options.chapters')}
          </Check>
          <Check checked={o.nfo} onChange={(nfo) => set({ nfo })}>
            {t('options.nfo')}
          </Check>
        </div>
        {o.embedCover && o.yt.container === 'webm' && !audioOnly && (
          <div className="mt-1 text-xs leading-relaxed text-muted">{t('ytUi.webmCoverHint')}</div>
        )}
        <label className={`mt-1 flex items-center gap-2 py-1 text-[13px] ${audioOnly || !o.chapters ? 'opacity-40' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            className="accent-bili"
            disabled={audioOnly || !o.chapters}
            checked={o.yt.sponsorblock === 'mark' && o.chapters && !audioOnly}
            onChange={(e) => setYt({ sponsorblock: (e.target.checked ? 'mark' : 'off') as SponsorBlockMode })}
          />
          {t('ytUi.sponsorblock')}
        </label>
        <div className="text-xs leading-relaxed text-muted">{t('ytUi.sponsorblockHint')}</div>
        {o.nfo && <div className="mt-1 text-xs leading-relaxed text-muted">{t('options.nfoHint')}</div>}
      </Section>
    </div>
  )
}
