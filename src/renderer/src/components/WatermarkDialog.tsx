import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Download, Eye, EyeOff, Loader2, RefreshCw, RotateCcw, Sparkles, X } from 'lucide-react'
import { cornerName } from '@shared/watermark'
import type { AiEstimate, AiModelStatus, WatermarkMethod, WatermarkPrep, WatermarkRegion } from '@shared/types'
import { estimateHints, estimateText, modelPct, modelText } from '../aiRefine'
import { fmtDuration } from '../format'
import { WatermarkOff } from '../icons'
import { api, useStore } from '../store'
import { dragRect, handleStyle, HANDLES, nextFrameTime, nudge, toView, type Handle } from '../watermarkBox'
import { Banner, Button, Modal, ModalFooter, ModalHeader, Progress, Segmented, STROKE } from './ui'

/** 框停止变化这么久之后再估算 AI 精修的耗时（估算要重新分析画面） */
const ESTIMATE_DELAY = 800

const METHODS: { value: WatermarkMethod; label: string; hint: string; icon?: typeof Sparkles }[] = [
  { value: 'fast', label: '快速', hint: '用周围的画面填补，几分钟内完成，水印处会有些糊' },
  { value: 'ai', label: 'AI 精修', icon: Sparkles, hint: '用 AI 模型逐帧补出水印下面的画面，清楚得多，但慢' }
]

interface Drag {
  handle: Handle
  x: number
  y: number
  start: WatermarkRegion
}

/** 在一帧画面上框选水印，确认后重新编码去掉它，替换原视频 */
export function WatermarkDialog({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const title = useStore((s) => s.tasks.find((t) => t.id === taskId)?.title)
  const [prep, setPrep] = useState<WatermarkPrep | null>(null)
  const [region, setRegion] = useState<WatermarkRegion | null>(null)
  const [time, setTime] = useState(0)
  const [image, setImage] = useState('')
  /** 去掉水印后的样子，框或画面一变就作废 */
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewW, setViewW] = useState(0)
  const imgRef = useRef<HTMLImageElement>(null)
  const drag = useRef<Drag | null>(null)
  // 默认跟设置里的“水印”一致：默认用 AI 精修的人，手动处理时也先选 AI 精修
  const preferAi = useStore((s) => s.settings?.defaults.watermark === 'ai')
  const [method, setMethod] = useState<WatermarkMethod>(preferAi ? 'ai' : 'fast')
  const [model, setModel] = useState<AiModelStatus | null>(null)
  const [estimate, setEstimate] = useState<AiEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const ai = method === 'ai'
  const modelReady = model?.state === 'ready'

  // 模型状态（下载进度由主进程推送）；关闭对话框时释放为预览开的推理进程
  useEffect(() => {
    let alive = true
    void api.watermark.aiStatus().then((s) => alive && setModel(s))
    const off = api.watermark.onAiStatus(setModel)
    return () => {
      alive = false
      off()
      void api.watermark.aiRelease(taskId)
    }
  }, [taskId])

  // AI 精修：框停下来后估算耗时；框又变了就作废旧的结果
  useEffect(() => {
    if (!ai || !modelReady || !region || prep?.blocker) return
    let alive = true
    setEstimate(null)
    setEstimateError(null)
    const timer = setTimeout(() => {
      setEstimating(true)
      api.watermark
        .aiEstimate(taskId, region)
        .then((e) => alive && setEstimate(e))
        .catch((e: Error) => alive && setEstimateError(e.message))
        .finally(() => alive && setEstimating(false))
    }, ESTIMATE_DELAY)
    return () => {
      alive = false
      clearTimeout(timer)
      setEstimating(false)
    }
  }, [ai, modelReady, region, taskId, prep?.blocker])

  useEffect(() => {
    let alive = true
    api.watermark
      .prepare(taskId)
      .then((p) => {
        if (!alive) return
        setPrep(p)
        setRegion(p.region)
        setTime(p.time)
        setImage(p.image)
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [taskId])

  // 图片按窗口大小缩放显示，换算坐标要用实际显示的宽度
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const ro = new ResizeObserver(() => setViewW(img.clientWidth))
    ro.observe(img)
    return () => ro.disconnect()
  }, [image])

  const scale = prep && viewW ? viewW / prep.width : 0

  const change = (r: WatermarkRegion): void => {
    setRegion(r)
    setPreview(null)
  }

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const nextFrame = (): Promise<void> =>
    run(async () => {
      const t = nextFrameTime(prep!.duration, time)
      setImage(await api.watermark.frame(taskId, t))
      setTime(t)
      setPreview(null)
    })

  const togglePreview = (): Promise<void> | void => {
    if (preview) return setPreview(null)
    return run(async () =>
      setPreview(ai ? await api.watermark.aiPreview(taskId, time, region!) : await api.watermark.frame(taskId, time, region!))
    )
  }

  const switchMethod = (m: WatermarkMethod): void => {
    setMethod(m)
    setPreview(null)
  }

  const start = (): Promise<void> =>
    run(async () => {
      await api.watermark.start(taskId, region!, method)
      onClose()
    })

  const onDown = (handle: Handle) => (e: PointerEvent<HTMLElement>) => {
    if (!region || preview) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { handle, x: e.clientX, y: e.clientY, start: region }
  }
  const onMove = (e: PointerEvent<HTMLElement>): void => {
    const d = drag.current
    if (!d || !prep || !scale) return
    change(dragRect(d.start, d.handle, (e.clientX - d.x) / scale, (e.clientY - d.y) / scale, prep.width, prep.height))
  }
  const onUp = (): void => {
    drag.current = null
  }

  const view = region && scale ? toView(region, scale) : null

  return (
    <Modal onClose={onClose} className="flex max-h-full max-w-3xl flex-col">
      <ModalHeader
        icon={WatermarkOff}
        title="去水印"
        subtitle="拖动方框盖住水印，拖四角和四边调整大小。处理时会重新编码视频，完成后替换原文件。"
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-6 pt-4">
        {title && <div className="truncate text-[13px] text-muted">{title}</div>}
        {error && <Banner tone="error">{error}</Banner>}
        {prep?.blocker && <Banner tone="warn">{prep.blocker}</Banner>}
        {prep && !prep.blocker && prep.applied && (
          <Banner tone="warn">这个视频已经去过一次水印，再处理会再重新编码一次，画质会略有损失。</Banner>
        )}
        {prep && !prep.blocker && !prep.applied && (
          <Banner tone="info">
            {prep.detected
              ? `已识别到${cornerName(prep.region, prep.width, prep.height)}的水印，可以再调整方框。`
              : '没有自动识别到水印，请把方框拖到水印上。'}
          </Banner>
        )}

        <div className="flex min-h-48 items-center justify-center rounded-xl bg-black/90 select-none">
          {image ? (
            <div className="relative" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <img
                ref={imgRef}
                src={preview ?? image}
                alt="视频画面"
                draggable={false}
                className="block max-h-[46vh] max-w-full"
                onLoad={(e) => setViewW(e.currentTarget.clientWidth)}
              />
              {view && !preview && (
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="水印区域，方向键移动，按住 Shift 一次移 10 像素"
                  aria-valuetext={`${region!.x},${region!.y} ${region!.w}×${region!.h}`}
                  className="absolute cursor-move border-2 border-bili bg-bili/20 outline-none focus-visible:ring-2 focus-visible:ring-white"
                  style={{ left: view.x, top: view.y, width: view.w, height: view.h }}
                  onPointerDown={onDown('move')}
                  onKeyDown={(e) => {
                    const r = nudge(region!, e.key, e.shiftKey, prep!.width, prep!.height)
                    if (!r) return
                    e.preventDefault()
                    change(r)
                  }}
                >
                  {HANDLES.map((h) => {
                    const st = handleStyle(h)
                    return (
                      <span
                        key={h}
                        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-bili bg-white shadow"
                        style={{ left: st.left, top: st.top, cursor: st.cursor }}
                        onPointerDown={onDown(h)}
                      />
                    )
                  })}
                </div>
              )}
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 size={22} strokeWidth={STROKE} className="animate-spin text-white" />
                </div>
              )}
            </div>
          ) : (
            !error && (
              <div className="flex items-center gap-2 py-16 text-[13px] text-white/70">
                <Loader2 size={16} strokeWidth={STROKE} className="animate-spin" />
                正在识别水印…
              </div>
            )
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Button size="sm" icon={RefreshCw} disabled={!prep || busy} onClick={nextFrame}>
            换一帧
          </Button>
          <Button size="sm" icon={preview ? EyeOff : Eye} disabled={!region || busy || Boolean(prep?.blocker)} onClick={togglePreview}>
            {preview ? '看原画面' : '预览效果'}
          </Button>
          <Button size="sm" icon={RotateCcw} disabled={!prep || busy} onClick={() => prep && change(prep.region)}>
            重置
          </Button>
          <div className="flex-1" />
          {prep && <span className="tabular-nums">{fmtDuration(time) || '0:00'}</span>}
          {region && (
            <span className="tabular-nums">
              · {region.w}×{region.h}
            </span>
          )}
          <Segmented size="sm" value={method} options={METHODS} onChange={switchMethod} disabled={busy} />
        </div>

        {ai && model && !modelReady && (
          <Banner
            tone={model.state === 'error' ? 'error' : 'info'}
            icon={model.state === 'downloading' ? Loader2 : Download}
            spin={model.state === 'downloading'}
            actions={
              model.state === 'downloading' ? (
                <Button size="sm" variant="ghost" icon={X} disabled={model.verifying} onClick={() => void api.watermark.aiCancelDownload()}>
                  取消
                </Button>
              ) : (
                <Button size="sm" icon={Download} onClick={() => void api.watermark.aiDownload()}>
                  {model.state === 'error' ? '重试' : '下载模型'}
                </Button>
              )
            }
          >
            <div>{modelText(model)}</div>
            {model.state === 'downloading' && <Progress value={modelPct(model)} className="mt-1.5" />}
          </Banner>
        )}
        {ai && modelReady && !prep?.blocker && (
          <>
            {estimating && (
              <Banner icon={Loader2} spin>
                正在估算耗时（第一次要加载模型、试跑几帧，十几秒）…
              </Banner>
            )}
            {estimateError && <Banner tone="error">{estimateError}</Banner>}
            {estimate && (
              <Banner icon={Sparkles}>
                <div>{estimateText(estimate)}</div>
                {estimateHints(estimate).map((h) => (
                  <div key={h} className="text-xs opacity-80">
                    {h}
                  </div>
                ))}
              </Banner>
            )}
          </>
        )}
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          icon={ai ? Sparkles : WatermarkOff}
          disabled={!region || busy || Boolean(prep?.blocker) || (ai && !modelReady)}
          onClick={start}
        >
          {ai ? '开始 AI 精修' : '开始处理'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
