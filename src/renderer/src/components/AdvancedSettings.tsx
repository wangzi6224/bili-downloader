import { useEffect, useState, type ReactNode } from 'react'
import type { ProxyMode } from '@shared/types'
import { api, updateSettings, useStore } from '../store'
import { Button } from './Modal'

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="border-b border-neutral-100 py-4 dark:border-neutral-800">
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

const inputCls =
  'rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-bili dark:border-neutral-700 dark:bg-neutral-900'

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

  const endpoint = `http://127.0.0.1:${s.mcp.port}/mcp`
  const clientConfig = JSON.stringify(
    { mcpServers: { 'bili-downloader': { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${s.mcp.token}` } } } },
    null,
    2
  )
  const copy = async (text: string, what: string): Promise<void> => {
    await api.writeClipboard(text)
    setMessage(`已复制${what}`)
  }

  return (
    <div className="pb-2">
      <Block title="网络代理" hint="接口请求、视频下载和登录窗口都会走这里的设置。只支持 HTTP 代理端口。">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={inputCls}
            value={s.proxy.mode}
            onChange={(e) => updateSettings({ proxy: { ...s.proxy, mode: e.target.value as ProxyMode } })}
          >
            <option value="direct">不使用代理</option>
            <option value="system">跟随系统</option>
            <option value="manual">手动设置</option>
          </select>
          {s.proxy.mode === 'manual' && (
            <>
              <input
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://127.0.0.1:7890"
                className={`${inputCls} w-56 font-mono`}
              />
              <Button disabled={proxyUrl === s.proxy.url} onClick={() => updateSettings({ proxy: { ...s.proxy, url: proxyUrl } })}>
                保存
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              setTestResult('测试中…')
              try {
                setTestResult(`连接正常，耗时 ${await api.net.test()} ms`)
              } catch (e) {
                setTestResult(`连接失败：${(e as Error).message}`)
              }
            }}
          >
            测试连接
          </Button>
        </div>
        <div className={`mt-1 text-xs ${netStatus.includes('有误') ? 'text-red-600' : 'text-neutral-500'}`}>
          当前：{netStatus || '…'}
          {testResult && ` · ${testResult}`}
        </div>
      </Block>

      <Block title="CDN 节点" hint="接口给的地址偶尔是很慢的节点，可以指定 B站自己的镜像节点；指定节点不通时会自动退回原地址。">
        <div className="flex flex-wrap items-center gap-2">
          <select className={inputCls} value={s.cdn} onChange={(e) => updateSettings({ cdn: e.target.value })}>
            <option value="">自动（使用接口返回的地址）</option>
            {hosts.map((h) => (
              <option key={h.host} value={h.host}>
                {h.label}
                {pings && ` · ${pings[h.host] === null ? '不通' : `${pings[h.host]} ms`}`}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={async () => {
              setPings({})
              const r = await api.net.pingCdn()
              setPings(Object.fromEntries(r.map((x) => [x.host, x.ms])))
            }}
          >
            测速
          </Button>
        </div>
        {pings && Object.keys(pings).length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-neutral-500">
            {hosts
              .map((h) => ({ ...h, ms: pings[h.host] }))
              .sort((a, b) => (a.ms ?? 1e9) - (b.ms ?? 1e9))
              .map((h) => (
                <div key={h.host} className="flex justify-between">
                  <span>{h.label}</span>
                  <span className="tabular-nums">{h.ms === null ? '不通' : `${h.ms} ms`}</span>
                </div>
              ))}
          </div>
        )}
        {pings && !Object.keys(pings).length && <div className="mt-1 text-xs text-neutral-500">测速中…</div>}
      </Block>

      <Block
        title="MCP 服务"
        hint="开启后，Claude 等 AI 客户端可以通过本机接口解析链接、创建下载、查看进度。只监听本机，必须带访问令牌。"
      >
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="accent-bili"
            checked={s.mcp.enabled}
            onChange={(e) => updateSettings({ mcp: { ...s.mcp, enabled: e.target.checked } })}
          />
          开启 MCP 服务
          {s.mcp.enabled && mcpStatus && (
            <span className={`ml-2 text-xs ${mcpStatus.running ? 'text-green-600' : 'text-red-600'}`}>
              {mcpStatus.running ? '运行中' : `未运行${mcpStatus.error ? `：${mcpStatus.error}` : ''}`}
            </span>
          )}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          端口
          <input
            type="number"
            min={1024}
            max={65535}
            value={s.mcp.port}
            onChange={(e) => updateSettings({ mcp: { ...s.mcp, port: Number(e.target.value) || 39231 } })}
            className={`${inputCls} w-24`}
          />
          <span className="font-mono text-xs text-neutral-500">{endpoint}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          令牌
          <code className="max-w-64 truncate rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
            {showToken ? s.mcp.token : '•'.repeat(24)}
          </code>
          <Button variant="ghost" onClick={() => setShowToken(!showToken)}>
            {showToken ? '隐藏' : '显示'}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (confirm('重新生成后，已配置的 AI 客户端需要更新令牌。继续？')) set({ settings: await api.mcp.regenerateToken() })
            }}
          >
            重新生成
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={() => copy(clientConfig, ' MCP 客户端配置（JSON）')}>复制客户端配置</Button>
          <Button
            variant="ghost"
            onClick={() =>
              copy(`claude mcp add --transport http bili-downloader ${endpoint} --header "Authorization: Bearer ${s.mcp.token}"`, ' Claude Code 命令')
            }
          >
            复制 Claude Code 命令
          </Button>
        </div>
      </Block>

      <Block title="配置文件" hint="导出设置、命名规则和订阅，方便换电脑或备份；不包含登录信息和 MCP 令牌。">
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              try {
                const r = await api.config.exportTo()
                if (r) setMessage(r)
              } catch (e) {
                setMessage(`导出失败：${(e as Error).message}`)
              }
            }}
          >
            导出配置
          </Button>
          <Button
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
            导入配置
          </Button>
        </div>
      </Block>
      {message && <div className="mt-3 text-xs text-green-600">{message}</div>}
    </div>
  )
}
