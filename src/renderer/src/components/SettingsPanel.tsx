import type { CodecPref, PowerMode } from '@shared/types'
import { api, updateSettings, useStore } from '../store'
import { Button, Modal } from './Modal'

const QN = [
  { qn: 127, label: '最高可用' },
  { qn: 120, label: '4K' },
  { qn: 116, label: '1080P 60帧' },
  { qn: 80, label: '1080P' },
  { qn: 64, label: '720P' },
  { qn: 32, label: '480P' }
]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="w-28 shrink-0 pt-1 text-sm">{label}</div>
      <div className="min-w-0 flex-1">
        {children}
        {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
      </div>
    </div>
  )
}

const selectCls =
  'rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900'

export function SettingsPanel() {
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)

  return (
    <Modal onClose={() => set({ settingsOpen: false })}>
      <div className="p-6">
        <div className="text-lg font-semibold">设置</div>
        <div className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-800">
          <Row label="下载目录">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-600 dark:text-neutral-300" title={s.downloadDir}>
                {s.downloadDir}
              </span>
              <Button onClick={async () => set({ settings: await api.settings.chooseDir() })}>更改</Button>
            </div>
          </Row>
          <Row label="同时下载" hint="同时进行的任务数，太多容易被 B站限速">
            <select className={selectCls} value={s.concurrency} onChange={(e) => updateSettings({ concurrency: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} 个
                </option>
              ))}
            </select>
          </Row>
          <Row label="默认清晰度" hint="没有这么高的清晰度时自动选择最接近的较低档">
            <select className={selectCls} value={s.defaultQn} onChange={(e) => updateSettings({ defaultQn: Number(e.target.value) })}>
              {QN.map((q) => (
                <option key={q.qn} value={q.qn}>
                  {q.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="默认编码">
            <select
              className={selectCls}
              value={s.defaultCodec}
              onChange={(e) => updateSettings({ defaultCodec: e.target.value as CodecPref })}
            >
              <option value="avc">AVC（兼容性最好）</option>
              <option value="hevc">HEVC（体积更小）</option>
              <option value="av1">AV1（需较新的 Mac）</option>
            </select>
          </Row>
          <Row label="默认附加内容">
            <div className="flex gap-4 text-sm">
              {(
                [
                  ['cover', '封面'],
                  ['subtitle', 'CC 字幕'],
                  ['danmaku', '弹幕']
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="accent-bili"
                    checked={s.extras[k]}
                    onChange={(e) => updateSettings({ extras: { ...s.extras, [k]: e.target.checked } })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Row>
          <Row label="弹幕样式" hint="生成 .ass 文件时使用，可在 IINA 等播放器中加载">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1">
                字号
                <input
                  type="number"
                  min={12}
                  max={50}
                  className={`${selectCls} w-16`}
                  value={s.danmaku.fontSize}
                  onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, fontSize: Number(e.target.value) || 25 } })}
                />
              </label>
              <label className="flex items-center gap-1">
                不透明度
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={s.danmaku.opacity}
                  onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, opacity: Number(e.target.value) } })}
                />
              </label>
              <label className="flex items-center gap-1">
                停留
                <input
                  type="number"
                  min={3}
                  max={20}
                  className={`${selectCls} w-14`}
                  value={s.danmaku.duration}
                  onChange={(e) => updateSettings({ danmaku: { ...s.danmaku, duration: Number(e.target.value) || 8 } })}
                />
                秒
              </label>
            </div>
          </Row>
          <Row label="下载时" hint="只在有任务进行时生效，全部完成后自动恢复系统默认">
            <select
              className={selectCls}
              value={s.powerMode}
              onChange={(e) => updateSettings({ powerMode: e.target.value as PowerMode })}
            >
              <option value="off">允许休眠</option>
              <option value="system">阻止系统睡眠（允许熄屏）</option>
              <option value="display">保持屏幕常亮</option>
            </select>
          </Row>
          <Row label="剪贴板检测">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="accent-bili"
                checked={s.clipboardWatch}
                onChange={(e) => updateSettings({ clipboardWatch: e.target.checked })}
              />
              切回应用时提示剪贴板里的 B站链接
            </label>
          </Row>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={() => set({ settingsOpen: false })}>
            完成
          </Button>
        </div>
      </div>
    </Modal>
  )
}
