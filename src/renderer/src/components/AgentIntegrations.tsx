import { useEffect, useState } from 'react'
import { Copy, Download, Eye, EyeOff, KeyRound, RefreshCw, Sparkles, Terminal, Trash2 } from 'lucide-react'
import type { AgentStatus } from '@shared/types'
import { agentHint, agentTone, needsForce, sortAgents } from '../agents'
import { AGENT_ICONS } from '../agentIcons'
import { useT } from '../i18n'
import { api, updateSettings, useStore } from '../store'
import { mcpClientConfig } from '../viewLogic'
import { Badge, Button, Group, IconButton, Input, Row, Switch } from './ui'

function AgentIcon({ id, name }: { id: string; name: string }) {
  const svg = AGENT_ICONS[id]
  if (!svg) {
    return <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-track text-xs font-medium text-muted">{name[0]}</span>
  }
  // 内联 SVG：单色图标用 currentColor，深色模式下跟着文字变色
  return <span aria-hidden className="flex size-6 shrink-0 items-center justify-center text-fg [&>svg]:size-6" dangerouslySetInnerHTML={{ __html: svg }} />
}

const INSTALLED = { restart: 'agents.installedRestart', trust: 'agents.installedTrust', none: 'agents.installed' } as const

/** 设置页“AI 助手”：一键把 MCP 和 skill 装进常用的 AI agent，下面是 MCP 服务本身的设置 */
export function AgentIntegrations() {
  const t = useT()
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)
  const [agents, setAgents] = useState<AgentStatus[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [mcpStatus, setMcpStatus] = useState<{ running: boolean; error?: string } | null>(null)
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    void api.agents.list().then(setAgents)
  }, [])
  // 设置变化后主进程会重新应用 MCP，稍等再读状态
  useEffect(() => {
    const timer = setTimeout(() => void api.mcp.status().then(setMcpStatus), 400)
    return () => clearTimeout(timer)
  }, [s.mcp])

  const run = async (key: string, fn: () => Promise<AgentStatus[]>, done: string): Promise<void> => {
    setBusy(key)
    setMessage(null)
    try {
      setAgents(await fn())
      setMessage({ text: done })
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true })
      void api.agents.list().then(setAgents)
    } finally {
      setBusy(null)
    }
  }

  const { endpoint, json: clientConfig, command } = mcpClientConfig(s.mcp.port, s.mcp.token)
  const copy = async (text: string, done: string): Promise<void> => {
    await api.writeClipboard(text)
    setMessage({ text: done })
  }
  const pending = agents?.filter((a) => a.supported && a.detected && !a.installed && !a.broken) ?? []

  return (
    <>
      <Group title={t('agents.group')}>
        <Row label={t('agents.installAll')} hint={t('agents.groupHint')}>
          <Button
            variant="primary"
            icon={Sparkles}
            disabled={!pending.length || busy !== null}
            onClick={() => run('all', () => api.agents.installAll(), t('agents.installedAll', { count: pending.length }))}
          >
            {t('agents.installAllButton', { count: pending.length })}
          </Button>
        </Row>
        {sortAgents(agents ?? []).map((a) => (
          <div key={a.id} className={`flex items-center gap-3 px-4 py-3 ${a.supported ? '' : 'opacity-50'}`}>
            <AgentIcon id={a.id} name={a.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] text-fg">
                {a.name}
                <Badge tone={agentTone(a)}>{t(`agents.state_${agentHint(a)}`)}</Badge>
              </div>
              <div className="mt-0.5 truncate text-xs text-muted" title={a.configFile}>
                {a.broken ? t('agents.brokenHint', { file: a.configFile }) : a.skill ? t('agents.withSkill') : t('agents.mcpOnly')}
                {a.skillConflict && ` · ${t('agents.skillConflict')}`}
                {a.installed && !a.detected && ` · ${t('agents.notDetectedHint', { name: a.name })}`}
                {a.installed && a.note === 'trust' && ` · ${t('agents.trustHint', { name: a.name })}`}
              </div>
            </div>
            {a.supported && a.installed && (
              <IconButton
                icon={Trash2}
                label={t('agents.uninstall')}
                disabled={busy !== null}
                onClick={() => run(a.id, () => api.agents.uninstall(a.id), t('agents.uninstalled', { name: a.name }))}
              />
            )}
            {needsForce(a) && (
              <Button
                variant="ghost"
                disabled={busy !== null || a.broken}
                onClick={() => {
                  if (!confirm(t('agents.forceConfirm', { name: a.name, file: a.configFile }))) return
                  void run(a.id, () => api.agents.install(a.id), t(INSTALLED[a.note], { name: a.name }))
                }}
              >
                {t('agents.installAnyway')}
              </Button>
            )}
            {a.supported && !needsForce(a) && (!a.installed || a.outdated) && (
              <Button
                icon={a.outdated ? RefreshCw : Download}
                disabled={busy !== null || a.broken}
                onClick={() => run(a.id, () => api.agents.install(a.id), t(INSTALLED[a.note], { name: a.name }))}
              >
                {a.outdated ? t('agents.update') : t('agents.install')}
              </Button>
            )}
          </div>
        ))}
      </Group>
      {message && (
        <div className={`-mt-3 px-1 text-xs ${message.error ? 'whitespace-pre-line text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {message.text}
        </div>
      )}

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
    </>
  )
}
