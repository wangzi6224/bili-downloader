import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, FileDown, FileUp, Gauge, KeyRound, Terminal, Wifi } from 'lucide-react'
import type { ProxyMode } from '@shared/types'
import { api, updateSettings, useStore } from '../store'
import { mcpClientConfig, pingLabel, sortPings } from '../viewLogic'
import { Badge, Button, Group, IconButton, Input, Row, Select, Switch } from './ui'

export function AdvancedSettings() {
  const s = useStore((st) => st.settings)!
  const set = useStore((st) => st.set)
  const [proxyUrl, setProxyUrl] = useState(s.proxy.url)
  const [netStatus, setNetStatus] = useState('')
  const [testResult, setTestResult] = useState('')
  const [hosts, setHosts] = useState<{ host: string; label: string }[]>([])
  const [pings, setPings] = useState<Record<string, number | null> | null>(null)
  const [mcpStatus, setMcpStatus] = useState<{ running: boolean; error?: string } | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void api.net.cdnHosts().then(setHosts)
  }, [])
  // 设置变化后主进程会重新应用代理和 MCP，稍等再读状态
  useEffect(() => {
    const t = setTimeout(() => {
      void api.net.status().then(setNetStatus)
      void api.mcp.status().then(setMcpStatus)
    }, 400)
    return () => clearTimeout(t)
  }, [s.proxy, s.mcp])

  const { endpoint, json: clientConfig, command } = mcpClientConfig(s.mcp.port, s.mcp.token)
  const copy = async (text: string, what: string): Promise<void> => {
    await api.writeClipboard(text)
    setMessage(`已复制${what}`)
  }

  return (
    <>
      <Group title="网络">
        <Row
          label="网络代理"
          hint={
            <>
              接口请求、视频下载和登录窗口都会走这里的设置，只支持 HTTP 代理端口。
              <span className={netStatus.includes('有误') ? 'text-red-600 dark:text-red-400' : ''}>
                {' '}
                当前：{netStatus || '…'}
              </span>
              {testResult && ` · ${testResult}`}
            </>
          }
        >
          <Select value={s.proxy.mode} onChange={(e) => updateSettings({ proxy: { ...s.proxy, mode: e.target.value as ProxyMode } })}>
            <option value="direct">不使用代理</option>
            <option value="system">跟随系统</option>
            <option value="manual">手动设置</option>
          </Select>
          <IconButton
            icon={Wifi}
            label="测试连接"
            onClick={async () => {
              setTestResult('测试中…')
              try {
                setTestResult(`连接正常，耗时 ${await api.net.test()} ms`)
              } catch (e) {
                setTestResult(`连接失败：${(e as Error).message}`)
              }
            }}
          />
        </Row>
        {s.proxy.mode === 'manual' && (
          <Row label="代理地址">
            <Input
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="http://127.0.0.1:7890"
              className="w-56"
              inputClassName="font-mono"
            />
            <Button disabled={proxyUrl === s.proxy.url} onClick={() => updateSettings({ proxy: { ...s.proxy, url: proxyUrl } })}>
              保存
            </Button>
          </Row>
        )}
        <Row label="CDN 节点" hint="接口给的地址偶尔是很慢的节点，可以指定 B站自己的镜像节点；指定节点不通时会自动退回原地址。">
          <Select value={s.cdn} onChange={(e) => updateSettings({ cdn: e.target.value })} className="max-w-56">
            <option value="">自动（使用接口返回的地址）</option>
            {hosts.map((h) => (
              <option key={h.host} value={h.host}>
                {h.label}
                {pings && ` · ${pingLabel(pings[h.host])}`}
              </option>
            ))}
          </Select>
          <IconButton
            icon={Gauge}
            label="测速"
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
              <div className="text-xs text-muted">测速中…</div>
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

      <Group title="MCP 服务">
        <Row
          label="开启 MCP 服务"
          hint="开启后，Claude 等 AI 客户端可以通过本机接口解析链接、创建下载、查看进度。只监听本机，必须带访问令牌。"
        >
          {s.mcp.enabled && mcpStatus && (
            <Badge tone={mcpStatus.running ? 'success' : 'danger'} title={mcpStatus.error}>
              {mcpStatus.running ? '运行中' : '未运行'}
            </Badge>
          )}
          <Switch checked={s.mcp.enabled} onChange={(enabled) => updateSettings({ mcp: { ...s.mcp, enabled } })} />
        </Row>
        {s.mcp.enabled && mcpStatus && !mcpStatus.running && mcpStatus.error && (
          <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400">{mcpStatus.error}</div>
        )}
        <Row label="端口" hint={<span className="font-mono">{endpoint}</span>}>
          <Input
            type="number"
            min={1024}
            max={65535}
            value={s.mcp.port}
            onChange={(e) => updateSettings({ mcp: { ...s.mcp, port: Number(e.target.value) || 39231 } })}
            className="w-24"
          />
        </Row>
        <Row label="访问令牌" hint={<code className="font-mono break-all">{showToken ? s.mcp.token : '•'.repeat(24)}</code>}>
          <IconButton icon={showToken ? EyeOff : Eye} label={showToken ? '隐藏' : '显示'} onClick={() => setShowToken(!showToken)} />
          <IconButton
            icon={KeyRound}
            label="重新生成令牌"
            onClick={async () => {
              if (confirm('重新生成后，已配置的 AI 客户端需要更新令牌。继续？')) set({ settings: await api.mcp.regenerateToken() })
            }}
          />
        </Row>
        <Row label="接入 AI 客户端" hint="复制后粘贴到客户端的 MCP 配置，或在终端运行 Claude Code 命令">
          <Button icon={Copy} onClick={() => copy(clientConfig, ' MCP 客户端配置（JSON）')}>
            客户端配置
          </Button>
          <Button
            icon={Terminal}
            onClick={() => copy(command, ' Claude Code 命令')}
          >
            Claude Code 命令
          </Button>
        </Row>
      </Group>

      <Group title="配置文件">
        <Row label="导入与导出" hint="导出设置、命名规则和订阅，方便换电脑或备份；不包含登录信息和 MCP 令牌。">
          <Button
            icon={FileUp}
            onClick={async () => {
              try {
                const r = await api.config.exportTo()
                if (r) setMessage(r)
              } catch (e) {
                setMessage(`导出失败：${(e as Error).message}`)
              }
            }}
          >
            导出
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
                setMessage(`导入失败：${(e as Error).message}`)
              }
            }}
          >
            导入
          </Button>
        </Row>
      </Group>
      {message && <div className="-mt-3 px-1 text-xs text-green-600 dark:text-green-400">{message}</div>}
    </>
  )
}
