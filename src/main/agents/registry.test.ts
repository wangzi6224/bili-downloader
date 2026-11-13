import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agentEnv, AGENTS, type AgentEnv } from './registry'

const env = (platform: NodeJS.Platform, exists: (p: string) => boolean = () => false, list: (d: string) => string[] = () => []): AgentEnv => ({
  ...agentEnv(platform, { BILI_AGENT_HOME: '/h' }),
  exists,
  list
})
const agent = (id: string) => AGENTS.find((a) => a.id === id)!

describe('agentEnv', () => {
  it('三个系统的应用数据目录', () => {
    expect(agentEnv('darwin', { BILI_AGENT_HOME: '/h' })).toMatchObject({ home: '/h', appData: join('/h', 'Library', 'Application Support') })
    expect(agentEnv('linux', { BILI_AGENT_HOME: '/h' }).appData).toBe(join('/h', '.config'))
    expect(agentEnv('linux', { HOME: '/x', XDG_CONFIG_HOME: '/xdg' }).appData).toBe('/xdg')
    expect(agentEnv('win32', { APPDATA: 'C:\\R', LOCALAPPDATA: 'C:\\L' })).toMatchObject({ appData: 'C:\\R', localAppData: 'C:\\L' })
    // 测试用的 home 不受真实环境变量影响
    expect(agentEnv('win32', { BILI_AGENT_HOME: '/h', APPDATA: 'C:\\R' })).toMatchObject({
      appData: join('/h', 'AppData', 'Roaming'),
      localAppData: join('/h', 'AppData', 'Local')
    })
    expect(agentEnv('win32', {}).appData).toContain('Roaming')
    expect(agentEnv().home).toBeTruthy()
  })
})

describe('AGENTS', () => {
  it('首批 10 个，id 不重复', () => {
    expect(AGENTS.map((a) => a.id)).toEqual([
      'claude-code',
      'claude-desktop',
      'codex',
      'cursor',
      'gemini-cli',
      'workbuddy',
      'codebuddy',
      'trae-cn',
      'qoder',
      'qwen-code'
    ])
  })

  it.each(['darwin', 'win32', 'linux'] as const)('%s 上每个 agent 的路径都在 home 下，检测标记都算得出来', (platform) => {
    for (const a of AGENTS) {
      const e = env(platform)
      if (a.platforms && !a.platforms.includes(platform)) continue
      for (const c of a.mcp(e)) expect(c.file.startsWith('/h'), a.id).toBe(true)
      expect(a.root(e).startsWith('/h'), a.id).toBe(true)
      if (a.skills) expect(a.skills(e).startsWith('/h'), a.id).toBe(true)
      expect(a.markers(e).length, a.id).toBeGreaterThan(0)
    }
  })

  it('Claude Desktop 不支持本地 skill；Windows 的 MSIX 版写到包的虚拟化目录', () => {
    const cd = agent('claude-desktop')
    expect(cd.skills).toBeUndefined()
    const pkgDir = join('/h', 'AppData', 'Local', 'Packages', 'Claude_pzs8', 'LocalCache', 'Roaming', 'Claude')
    const msix = env('win32', (p) => p === pkgDir, () => ['Other_1', 'Claude_pzs8'])
    expect(cd.mcp(msix)[0].file).toBe(join(pkgDir, 'claude_desktop_config.json'))
    // 包目录还没建好，或者不是 MSIX 版：用 %APPDATA%
    expect(cd.mcp(env('win32', () => false, () => ['Claude_pzs8']))[0].file).toBe(join('/h', 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'))
    expect(cd.mcp(env('linux'))[0].file).toBe(join('/h', '.config', 'Claude', 'claude_desktop_config.json'))
  })

  it('会读 ~/.agents/skills 的 agent 只写共享目录，不读的写自己的', () => {
    const e = env('darwin')
    const shared = join('/h', '.agents', 'skills')
    for (const id of ['codex', 'cursor', 'gemini-cli', 'qoder', 'qwen-code']) expect(agent(id).skills!(e), id).toBe(shared)
    for (const id of ['claude-code', 'workbuddy', 'codebuddy', 'trae-cn']) expect(agent(id).skills!(e), id).not.toBe(shared)
  })

  it('Qoder 的 IDE 和 CLI 两份都写；CodeBuddy CLI 的 .mcp.json 只在已经存在时写', () => {
    expect(agent('qoder').mcp(env('darwin')).map((c) => c.file)).toEqual([join('/h', '.qoder', 'mcp.json'), join('/h', '.qoder', 'settings.json')])
    const cb = agent('codebuddy').mcp(env('darwin'))
    expect(cb.map((c) => !!c.optional)).toEqual([false, true])
  })

  it('读不了的目录当作空', () => {
    expect(agentEnv('linux', { BILI_AGENT_HOME: '/nonexistent-dir' }).list('/nonexistent-dir/x')).toEqual([])
  })
})
