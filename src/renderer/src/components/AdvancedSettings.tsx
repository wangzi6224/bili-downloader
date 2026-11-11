import { useEffect, useState } from 'react'
import { Copy, Download, Eye, EyeOff, FileDown, FileUp, Gauge, KeyRound, Terminal, Trash2, Wifi, X } from 'lucide-react'
import type { AiModelStatus, NetworkStatus, ProxyMode } from '@shared/types'
import { modelSettingsText } from '../aiRefine'
import { useT } from '../i18n'
import { api, updateSettings, useStore } from '../store'
import { mcpClientConfig, pingLabel, sortPings } from '../viewLogic'
import { Badge, Button, Group, IconButton, Input, Row, Select, Switch } from './ui'

export function AdvancedSettings() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)
  const [proxyUrl, setProxyUrl] = useState(s.proxy.url)
  const [netStatus, setNetStatus] = useState<NetworkStatus | null>(null)
  const [testResult, setTestResult] = useState('')
  const [hosts, setHosts] = useState<{ host: string; label: string }[]>([])
  const [pings, setPings] = useState<Record<string, number | null> | null>(null)
  const [mcpStatus, setMcpStatus] = useState<{ running: boolean; error?: string } | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [message, setMessage] = useState('')
  const [aiModel, setAiModel] = useState<AiModelStatus | null>(null)

  useEffect(() => {
    void api.net.cdnHosts().then(setHosts)
    void api.watermark.aiStatus().then(setAiModel)
    return api.watermark.onAiStatus(setAiModel)
  }, [])
  // 设置变化后主进程会重新应用代理和 MCP，稍等再读状态
  useEffect(() => {
    const timer = setTimeout(() => {
      void api.net.status().then(setNetStatus)
      void api.mcp.status().then(setMcpStatus)
    }, 400)
    return () => clearTimeout(timer)
  }, [s.proxy, s.mcp])

  const { endpoint, json: clientConfig, command } = mcpClientConfig(s.mcp.port, s.mcp.token)
  const copy = async (text: string, done: string): Promise<void> => {
    await api.writeClipboard(text)
    setMessage(done)
  }

  return (
    <>
      <Group title={t('advanced.network')}>
        <Row
          label={t('advanced.proxy')}
          hint={
            <>
              {t('advanced.proxyHint')}
              <span className={netStatus?.error ? 'text-red-600 dark:text-red-400' : ''}>
                {' '}
                {t('advanced.proxyCurrent', { status: netStatus?.text || '…' })}
              </span>
              {testResult && ` · ${testResult}`}
            </>
          }
        >
          <Select value={s.proxy.mode} onChange={(e) => updateSettings({ proxy: { ...s.proxy, mode: e.target.value as ProxyMode } })}>
            <option value="direct">{t('advanced.proxyDirect')}</option>
            <option value="system">{t('advanced.proxySystem')}</option>
            <option value="manual">{t('advanced.proxyManual')}</option>
          </Select>
          <IconButton
            icon={Wifi}
            label={t('advanced.testConnection')}
            onClick={async () => {
              setTestResult(t('advanced.testing'))
              try {
                setTestResult(t('advanced.testOk', { ms: await api.net.test() }))
              } catch (e) {
                setTestResult(t('advanced.testFailed', { error: (e as Error).message }))
              }
            }}
          />
        </Row>
        {s.proxy.mode === 'manual' && (
          <Row label={t('advanced.proxyUrl')}>
            <Input
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="http://127.0.0.1:7890"
              className="w-56"
              inputClassName="font-mono"
            />
            <Button disabled={proxyUrl === s.proxy.url} onClick={() => updateSettings({ proxy: { ...s.proxy, url: proxyUrl } })}>
              {t('advanced.save')}
            </Button>
          </Row>
        )}
        <Row label={t('advanced.cdn')} hint={t('advanced.cdnHint')}>
          <Select value={s.cdn} onChange={(e) => updateSettings({ cdn: e.target.value })} className="max-w-56">
            <option value="">{t('advanced.cdnAuto')}</option>
            {hosts.map((h) => (
              <option key={h.host} value={h.host}>
                {h.label}
                {pings && ` · ${pingLabel(pings[h.host])}`}
              </option>
            ))}
          </Select>
          <IconButton
            icon={Gauge}
            label={t('advanced.ping')}
            onClick={async () => {
              setPings({})
              const r = await api.net.pingCdn()
              setPings(Object.fromEntries(r.map((x) => [x.host, x.ms])))
            }}
          />
        </Row>
        {pings && (
          <div className="px-4 py-3">
            {!Object.keys(pings).length ? (
              <div className="text-xs text-muted">{t('advanced.pinging')}</div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted">
                {sortPings(hosts, pings).map((h) => (
                  <div key={h.host} className="flex justify-between">
                    <span>{h.label}</span>
                    <span className={`tabular-nums ${h.ms === null ? 'text-red-600 dark:text-red-400' : ''}`}>{pingLabel(h.ms)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Group>

      <Group title={t('advanced.mcpGroup')}>
        <Row label={t('advanced.mcpEnable')} hint={t('advanced.mcpEnableHint')}>
          {s.mcp.enabled && mcpStatus && (
            <Badge tone={mcpStatus.running ? 'success' : 'danger'} title={mcpStatus.error}>
              {mcpStatus.running ? t('advanced.mcpRunning') : t('advanced.mcpStopped')}
            </Badge>
          )}
          <Switch checked={s.mcp.enabled} onChange={(enabled) => updateSettings({ mcp: { ...s.mcp, enabled } })} />
        </Row>
        {s.mcp.enabled && mcpStatus && !mcpStatus.running && mcpStatus.error && (
          <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400">{mcpStatus.error}</div>
        )}
        <Row label={t('advanced.port')} hint={<span className="font-mono">{endpoint}</span>}>
          <Input
            type="number"
            min={1024}
            max={65535}
            value={s.mcp.port}
            onChange={(e) => updateSettings({ mcp: { ...s.mcp, port: Number(e.target.value) || 39231 } })}
            className="w-24"
          />
        </Row>
        <Row label={t('advanced.token')} hint={<code className="font-mono break-all">{showToken ? s.mcp.token : '•'.repeat(24)}</code>}>
          <IconButton icon={showToken ? EyeOff : Eye} label={showToken ? t('advanced.hide') : t('advanced.show')} onClick={() => setShowToken(!showToken)} />
          <IconButton
            icon={KeyRound}
            label={t('advanced.regenerateToken')}
            onClick={async () => {
              if (confirm(t('advanced.regenerateConfirm'))) set({ settings: await api.mcp.regenerateToken() })
            }}
          />
        </Row>
        <Row label={t('advanced.connectClient')} hint={t('advanced.connectClientHint')}>
          <Button icon={Copy} onClick={() => copy(clientConfig, t('advanced.copiedConfig'))}>
            {t('advanced.clientConfig')}
          </Button>
          <Button icon={Terminal} onClick={() => copy(command, t('advanced.copiedCommand'))}>
            {t('advanced.claudeCodeCommand')}
          </Button>
        </Row>
      </Group>

      <Group title={t('advanced.aiGroup')}>
        <Row label={t('advanced.aiModel')} hint={aiModel ? modelSettingsText(aiModel) : '…'}>
          {aiModel?.state === 'downloading' ? (
            <Button icon={X} disabled={aiModel.verifying} onClick={() => void api.watermark.aiCancelDownload()}>
              {t('advanced.cancelDownload')}
            </Button>
          ) : aiModel?.state === 'ready' || (aiModel?.disk ?? 0) > 0 ? (
            <Button icon={Trash2} onClick={() => void api.watermark.aiRemove()}>
              {t('advanced.remove')}
            </Button>
          ) : (
            <Button icon={Download} disabled={!aiModel} onClick={() => void api.watermark.aiDownload()}>
              {t('advanced.download')}
            </Button>
          )}
        </Row>
      </Group>

      <Group title={t('advanced.configGroup')}>
        <Row label={t('advanced.importExport')} hint={t('advanced.importExportHint')}>
          <Button
            icon={FileUp}
            onClick={async () => {
              try {
                const r = await api.config.exportTo()
                if (r) setMessage(r)
              } catch (e) {
                setMessage(t('advanced.exportFailed', { error: (e as Error).message }))
              }
            }}
          >
            {t('advanced.export')}
          </Button>
          <Button
            icon={FileDown}
            onClick={async () => {
              try {
                const r = await api.config.importFrom()
                if (r) {
                  setMessage(r)
                  set({ settings: await api.settings.get() })
                }
              } catch (e) {
                setMessage(t('advanced.importFailed', { error: (e as Error).message }))
              }
            }}
          >
            {t('advanced.import')}
          </Button>
        </Row>
      </Group>
      {message && <div className="-mt-3 px-1 text-xs text-green-600 dark:text-green-400">{message}</div>}
    </>
  )
}
