import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ConfigTarget } from './configFile'

/**
 * 能一键接入的 agent：每个一项，写明三个系统上怎么检测、MCP 配置写在哪、skill 放在哪。
 * 新增 agent 只改这张表。路径都从 AgentEnv 拼，测试时可以整个换成临时目录。
 * 路径按各家官方文档和安装包源码核对过（2026-11）。
 */

export interface AgentEnv {
  platform: NodeJS.Platform
  home: string
  /** Windows 的 %APPDATA%；macOS 的 ~/Library/Application Support；Linux 的 $XDG_CONFIG_HOME 或 ~/.config */
  appData: string
  /** Windows 的 %LOCALAPPDATA%（其他系统用不到，和 appData 相同） */
  localAppData: string
  exists: (path: string) => boolean
  /** 列出目录里的条目，目录不存在时返回空数组 */
  list: (dir: string) => string[]
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** BILI_AGENT_HOME 把 home 换成别的目录，端到端测试时不碰真实的 agent 配置 */
export function agentEnv(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): AgentEnv {
  const fake = env.BILI_AGENT_HOME
  const home = fake || homedir()
  const win = platform === 'win32'
  const appData = win
    ? (!fake && env.APPDATA) || join(home, 'AppData', 'Roaming')
    : platform === 'darwin'
      ? join(home, 'Library', 'Application Support')
      : (!fake && env.XDG_CONFIG_HOME) || join(home, '.config')
  const localAppData = win ? (!fake && env.LOCALAPPDATA) || join(home, 'AppData', 'Local') : appData
  return { platform, home, appData, localAppData, exists: existsSync, list: listDir }
}

/** 装好后给用户的提示：重启 agent，或者在 agent 里点“信任” */
export type AgentNote = 'restart' | 'trust' | 'none'

export interface AgentDef {
  id: string
  name: string
  /** 只在这些系统上能装；不写表示都能装 */
  platforms?: NodeJS.Platform[]
  /** 有一个存在就算本机装了这个 agent */
  markers(env: AgentEnv): string[]
  /** agent 自己的数据目录：整个不见了说明 agent 被卸载了，同步时跳过 */
  root(env: AgentEnv): string
  /** MCP 配置文件；第一个是主文件，状态按它判断，其余的一并写 */
  mcp(env: AgentEnv): ConfigTarget[]
  /**
   * 用户级 skill 目录；不支持 skill 的没有。
   * 会读共享目录 ~/.agents/skills 的 agent 只写那一份，免得同一个 skill 出现两次
   */
  skills?(env: AgentEnv): string
  note: AgentNote
}

/** 桌面应用的位置：macOS 的 .app、Windows 的默认安装目录、Linux 的命令或安装目录 */
function appMarkers(env: AgentEnv, app: { mac?: string[]; win?: string[]; linux?: string[] }): string[] {
  if (env.platform === 'darwin') return (app.mac ?? []).flatMap((name) => [`/Applications/${name}.app`, join(env.home, 'Applications', `${name}.app`)])
  if (env.platform === 'win32') return (app.win ?? []).map((dir) => join(env.localAppData, 'Programs', dir))
  return (app.linux ?? []).flatMap((bin) => (bin.startsWith('/') ? [bin] : [`/usr/bin/${bin}`, `/usr/local/bin/${bin}`, join(env.home, '.local', 'bin', bin)]))
}

const json = (file: string, extra?: Record<string, unknown>, optional?: boolean): ConfigTarget => ({
  file,
  format: 'json',
  key: ['mcpServers'],
  extra,
  optional
})

/** Codex、Cursor、Gemini CLI、Qwen Code、Qoder 都会读的共享 skill 目录 */
const sharedSkills = (env: AgentEnv): string => join(env.home, '.agents', 'skills')

/**
 * Claude Desktop 在 Windows 上是 MSIX 包时，实际读的是包的虚拟化目录（界面里“编辑配置”打开的却是 %APPDATA% 那份）。
 * 包名带签名 hash，按前缀找
 */
function claudeDesktopDir(env: AgentEnv): string {
  if (env.platform === 'win32') {
    const packages = join(env.localAppData, 'Packages')
    const pkg = env.list(packages).find((name) => name.startsWith('Claude_'))
    const dir = pkg && join(packages, pkg, 'LocalCache', 'Roaming', 'Claude')
    if (dir && env.exists(dir)) return dir
  }
  return join(env.appData, 'Claude')
}

export const AGENTS: AgentDef[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    markers: (env) => [join(env.home, '.claude'), join(env.home, '.claude.json')],
    root: (env) => join(env.home, '.claude'),
    // 用户级（所有项目都能用）的 MCP 服务写在 ~/.claude.json 顶层的 mcpServers；Claude Code 不读 ~/.agents/skills
    mcp: (env) => [json(join(env.home, '.claude.json'), { type: 'stdio' })],
    skills: (env) => join(env.home, '.claude', 'skills'),
    note: 'restart'
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    markers: (env) => [
      claudeDesktopDir(env),
      ...appMarkers(env, { mac: ['Claude'], linux: ['claude-desktop'] }),
      join(env.localAppData, 'AnthropicClaude')
    ],
    root: claudeDesktopDir,
    mcp: (env) => [json(join(claudeDesktopDir(env), 'claude_desktop_config.json'))],
    // 聊天里的 skill 只能在界面上传，没有本地目录
    note: 'restart'
  },
  {
    id: 'codex',
    name: 'Codex',
    // CLI、ChatGPT 桌面版（原 Codex app）和 IDE 扩展共用 ~/.codex
    markers: (env) => [join(env.home, '.codex')],
    root: (env) => join(env.home, '.codex'),
    // 应用没开时桥接进程要先把它拉起来，Codex 默认只等 10 秒
    mcp: (env) => [{ file: join(env.home, '.codex', 'config.toml'), format: 'toml', key: ['mcp_servers'], extra: { startup_timeout_sec: 30 } }],
    // 官方的用户级 skill 目录；不要再写已弃用的 ~/.codex/skills，否则会出现两份
    skills: sharedSkills,
    note: 'restart'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    markers: (env) => [join(env.home, '.cursor'), ...appMarkers(env, { mac: ['Cursor'], win: ['cursor'], linux: ['cursor'] })],
    root: (env) => join(env.home, '.cursor'),
    mcp: (env) => [json(join(env.home, '.cursor', 'mcp.json'), { type: 'stdio' })],
    skills: sharedSkills,
    note: 'restart'
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    markers: (env) => [join(env.home, '.gemini')],
    root: (env) => join(env.home, '.gemini'),
    mcp: (env) => [json(join(env.home, '.gemini', 'settings.json'))],
    skills: sharedSkills,
    note: 'restart'
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    markers: (env) => [join(env.home, '.workbuddy'), ...appMarkers(env, { mac: ['WorkBuddy'], win: ['WorkBuddy'] })],
    root: (env) => join(env.home, '.workbuddy'),
    mcp: (env) => [json(join(env.home, '.workbuddy', 'mcp.json'))],
    // WorkBuddy 不读共享目录
    skills: (env) => join(env.home, '.workbuddy', 'skills'),
    // 外部写入的 MCP 服务要用户在 MCP 面板里点“信任”才会启动
    note: 'trust'
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    // WorkBuddy 内置的 CodeBuddy CLI 也会建 ~/.codebuddy（只放日志），不能只凭目录判断
    markers: (env) => [
      join(env.home, '.codebuddy', 'mcp.json'),
      join(env.home, '.codebuddy', '.mcp.json'),
      join(env.home, '.codebuddy', 'settings.json'),
      join(env.home, '.codebuddy.json'),
      ...appMarkers(env, { mac: ['CodeBuddy', 'CodeBuddy CN'], win: ['CodeBuddy', 'CodeBuddy CN'] })
    ],
    root: (env) => join(env.home, '.codebuddy'),
    // IDE 读 mcp.json；CLI 有 .mcp.json 时只读它，所以它在的话也写一份，但不主动新建
    mcp: (env) => [
      json(join(env.home, '.codebuddy', 'mcp.json'), { type: 'stdio' }),
      json(join(env.home, '.codebuddy', '.mcp.json'), { type: 'stdio' }, true)
    ],
    // CLI 不读共享目录；IDE 两边都读，同名时这里优先
    skills: (env) => join(env.home, '.codebuddy', 'skills'),
    note: 'none'
  },
  {
    id: 'trae-cn',
    name: 'Trae CN',
    markers: (env) => [
      join(env.home, '.trae-cn'),
      join(env.appData, 'Trae CN'),
      ...appMarkers(env, { mac: ['Trae CN', 'TRAE CN'], win: ['Trae CN', 'TRAE CN'], linux: ['trae-cn'] })
    ],
    root: (env) => join(env.appData, 'Trae CN'),
    // 改动后会自动重新加载
    mcp: (env) => [json(join(env.appData, 'Trae CN', 'User', 'mcp.json'))],
    skills: (env) => join(env.home, '.trae-cn', 'skills'),
    note: 'none'
  },
  {
    id: 'qoder',
    name: 'Qoder',
    markers: (env) => [join(env.home, '.qoder'), ...appMarkers(env, { mac: ['Qoder', 'Qoder IDE'], win: ['Qoder', 'Qoder IDE'], linux: ['/usr/share/qoder-ide'] })],
    root: (env) => join(env.home, '.qoder'),
    // IDE 读 mcp.json，CLI 和新版桌面 app 读 settings.json，两份都写
    mcp: (env) => [json(join(env.home, '.qoder', 'mcp.json')), json(join(env.home, '.qoder', 'settings.json'))],
    skills: sharedSkills,
    note: 'none'
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    markers: (env) => [join(env.home, '.qwen')],
    root: (env) => join(env.home, '.qwen'),
    mcp: (env) => [json(join(env.home, '.qwen', 'settings.json'))],
    skills: sharedSkills,
    note: 'restart'
  }
]
