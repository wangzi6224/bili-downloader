import { existsSync, mkdirSync, readdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StdioEntry } from './configFile'
import { Integrations, type IntegrationDeps } from './integrations'
import { agentEnv, AGENTS, type AgentDef, type AgentEnv } from './registry'

let home: string
let env: AgentEnv
let entry: StdioEntry
let version: string
const enableMcp = vi.fn()

const jsonAgent: AgentDef = {
  id: 'alpha',
  name: 'Alpha',
  markers: (e) => [join(e.home, '.alpha')],
  root: (e) => join(e.home, '.alpha'),
  mcp: (e) => [
    { file: join(e.home, '.alpha', 'mcp.json'), format: 'json', key: ['mcpServers'] },
    { file: join(e.home, '.alpha', 'cli.json'), format: 'json', key: ['mcpServers'], optional: true }
  ],
  skills: (e) => join(e.home, '.alpha', 'skills'),
  note: 'restart'
}
const noSkill: AgentDef = {
  id: 'beta',
  name: 'Beta',
  platforms: ['darwin', 'linux', 'win32'],
  markers: (e) => [join(e.home, '.beta')],
  root: (e) => join(e.home, '.beta'),
  mcp: (e) => [{ file: join(e.home, '.beta', 'config.toml'), format: 'toml', key: ['mcp_servers'] }],
  note: 'none'
}
const otherOs: AgentDef = { ...noSkill, id: 'gamma', name: 'Gamma', platforms: ['aix'] }

const paths = {
  alphaMcp: () => join(home, '.alpha', 'mcp.json'),
  alphaSkill: () => join(home, '.alpha', 'skills', 'bili-downloader', 'SKILL.md'),
  betaToml: () => join(home, '.beta', 'config.toml'),
  records: () => join(home, 'records.json')
}
const read = (f: string): any => JSON.parse(readFileSync(f, 'utf8'))
/** agent 自己留下的东西：目录里有一份不是我们写的文件 */
const presence = (dir: string): void => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'history.jsonl'), '')
}
/** home 下的所有文件和目录（不含安装记录） */
const tree = (): string[] => (readdirSync(home, { recursive: true }) as string[]).filter((p) => p !== 'records.json').sort()

function make(extra: Partial<IntegrationDeps> = {}): Integrations {
  return new Integrations({
    file: paths.records(),
    agents: [jsonAgent, noSkill, otherOs],
    env,
    version,
    entry: () => entry,
    enableMcp,
    ...extra
  })
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agents-'))
  env = { platform: 'darwin', home, appData: home, localAppData: home, exists: existsSync, list: readdirSync }
  entry = { command: '/App', args: ['/bridge.js', '--user-data', '/data'], env: { ELECTRON_RUN_AS_NODE: '1' } }
  version = '1.0.0'
  enableMcp.mockReset()
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

const byId = (list: ReturnType<Integrations['list']>) => Object.fromEntries(list.map((s) => [s.id, s]))

describe('list', () => {
  it('按检测结果和系统给出状态', () => {
    presence(join(home, '.alpha'))
    const s = byId(make().list())
    expect(s.alpha).toMatchObject({ supported: true, detected: true, installed: false, outdated: false, skill: true, note: 'restart', configFile: paths.alphaMcp() })
    expect(s.beta).toMatchObject({ detected: false, skill: false })
    expect(s.gamma).toMatchObject({ supported: false })
  })

  it('有条目但没有安装记录（用户自己配的）不算装过；配置文件坏了标出来', () => {
    mkdirSync(join(home, '.alpha'))
    writeFileSync(paths.alphaMcp(), JSON.stringify({ mcpServers: { 'bili-downloader': { command: 'x' } } }))
    expect(byId(make().list()).alpha.installed).toBe(false)
    writeFileSync(paths.alphaMcp(), '{oops')
    expect(byId(make().list()).alpha.broken).toBe(true)
  })

  it('安装记录文件坏了当作没有', () => {
    writeFileSync(paths.records(), '[1]')
    expect(make().list().some((s) => s.installed)).toBe(false)
  })
})

describe('install / uninstall', () => {
  it('写 MCP 条目和 skill，记下来，并打开 MCP 服务', () => {
    const list = byId(make().install('alpha'))
    expect(enableMcp).toHaveBeenCalled()
    expect(read(paths.alphaMcp()).mcpServers['bili-downloader']).toEqual(entry)
    expect(readFileSync(paths.alphaSkill(), 'utf8')).toContain('version: "1.0.0"')
    expect(list.alpha).toMatchObject({ installed: true, outdated: false })
    expect(read(paths.records()).alpha.skill).toBe('1.0.0')
  })

  it('不支持 skill 的只写 MCP', () => {
    const list = byId(make().install('beta'))
    expect(readFileSync(paths.betaToml(), 'utf8')).toContain('[mcp_servers.bili-downloader]')
    expect(list.beta.installed).toBe(true)
    expect(read(paths.records()).beta.skill).toBeUndefined()
  })

  it('同名的 skill 是用户自己的就不覆盖', () => {
    mkdirSync(join(home, '.alpha', 'skills', 'bili-downloader'), { recursive: true })
    writeFileSync(paths.alphaSkill(), '---\nname: bili-downloader\n---\n我的')
    const list = byId(make().install('alpha'))
    expect(readFileSync(paths.alphaSkill(), 'utf8')).toContain('我的')
    expect(list.alpha).toMatchObject({ installed: true, outdated: false, skillConflict: true })
    // 卸载时也不删它
    make().uninstall('alpha')
    expect(existsSync(paths.alphaSkill())).toBe(true)
  })

  it('卸载删掉条目、skill 和记录', () => {
    presence(join(home, '.alpha'))
    writeFileSync(paths.alphaMcp(), '{"theme": "dark"}')
    make().install('alpha')
    const list = byId(make().uninstall('alpha'))
    expect(read(paths.alphaMcp())).toEqual({ theme: 'dark', mcpServers: {} })
    expect(existsSync(paths.alphaSkill())).toBe(false)
    expect(read(paths.records()).alpha).toBeUndefined()
    expect(list.alpha.installed).toBe(false)
    // 不支持 skill 的也能卸载
    make().install('beta')
    expect(byId(make().uninstall('beta')).beta.installed).toBe(false)
  })

  it('不认识的、这个系统上没有的、配置文件坏了的都报错，不写文件', () => {
    expect(() => make().install('nope')).toThrow('nope')
    expect(() => make().uninstall('nope')).toThrow('nope')
    expect(() => make().install('gamma')).toThrow('Gamma')
    mkdirSync(join(home, '.alpha'))
    writeFileSync(paths.alphaMcp(), '{oops')
    expect(() => make().install('alpha')).toThrow(paths.alphaMcp())
    expect(() => make().uninstall('alpha')).toThrow(paths.alphaMcp())
    expect(existsSync(paths.records())).toBe(false)
  })

  it('写文件出了别的错照常抛出', () => {
    // 配置文件的位置是个目录，读写都会失败
    mkdirSync(paths.alphaMcp(), { recursive: true })
    expect(() => make().install('alpha')).toThrow()
    const broken = make({ agents: [{ ...jsonAgent, mcp: () => [{ file: paths.alphaMcp(), format: 'json', key: [] }] }] })
    expect(() => broken.uninstall('alpha')).not.toThrow()
  })
})

describe('installAll', () => {
  it('只装检测到、能装、还没装、配置没坏的；失败的原因一起报出来，其他的照装', () => {
    presence(join(home, '.alpha'))
    presence(join(home, '.beta'))
    const list = byId(make().installAll())
    expect(list.alpha.installed && list.beta.installed).toBe(true)
    expect(list.gamma.installed).toBe(false)

    rmSync(paths.records())
    rmSync(paths.betaToml())
    const failing = make({
      agents: [
        { ...jsonAgent, mcp: () => [{ file: join(home, '.alpha'), format: 'json', key: ['mcpServers'] }] },
        noSkill
      ]
    })
    expect(() => failing.installAll()).toThrow()
    expect(existsSync(paths.betaToml())).toBe(true)
  })
})

describe('sync', () => {
  it('版本变了重写 skill，应用位置变了重写条目；都没变就不动', () => {
    make().install('alpha')
    make().install('beta')
    expect(make().sync()).toEqual([])
    version = '1.1.0'
    expect(byId(make().list()).alpha.outdated).toBe(true)
    expect(make().sync()).toEqual(['alpha'])
    expect(readFileSync(paths.alphaSkill(), 'utf8')).toContain('version: "1.1.0"')
    expect(read(paths.records()).alpha.skill).toBe('1.1.0')
    entry = { ...entry, command: '/Moved' }
    expect(make().sync().sort()).toEqual(['alpha', 'beta'])
    expect(read(paths.alphaMcp()).mcpServers['bili-downloader'].command).toBe('/Moved')
    expect(readFileSync(paths.betaToml(), 'utf8')).toContain('command = "/Moved"')
    expect(byId(make().list()).alpha.outdated).toBe(false)
  })

  it('用户删了 MCP 条目就当作卸载，连我们的 skill 一起删，不再装回去', () => {
    make().install('alpha')
    writeFileSync(paths.alphaMcp(), '{}')
    version = '2.0.0'
    expect(make().sync()).toEqual([])
    expect(existsSync(paths.alphaSkill())).toBe(false)
    expect(read(paths.records()).alpha).toBeUndefined()
    // 我们新建的、只剩空架子的配置文件和目录一并收拾掉
    expect(tree()).toEqual([])
  })

  it('条目被换成了不是本实例写的配置（手写的 HTTP 版、别的数据目录的实例）：不覆盖，当作卸载', () => {
    make().install('alpha')
    for (const other of [{ type: 'http', url: 'http://127.0.0.1:1/mcp' }, { command: '/App', args: ['/bridge.js', '--user-data', '/other'] }]) {
      writeFileSync(paths.alphaMcp(), JSON.stringify({ mcpServers: { 'bili-downloader': other } }))
      expect(byId(make().list()).alpha.installed).toBe(false)
    }
    version = '2.0.0'
    expect(make().sync()).toEqual([])
    expect(read(paths.alphaMcp()).mcpServers['bili-downloader']).toEqual({ command: '/App', args: ['/bridge.js', '--user-data', '/other'] })
    expect(read(paths.records()).alpha).toBeUndefined()
    expect(existsSync(paths.alphaSkill())).toBe(false)
  })

  it('用户只删了 skill：之后只更新 MCP，不补 skill', () => {
    make().install('alpha')
    rmSync(join(home, '.alpha', 'skills'), { recursive: true })
    version = '2.0.0'
    expect(byId(make().list()).alpha.outdated).toBe(false)
    expect(make().sync()).toEqual([])
    expect(read(paths.records()).alpha.skill).toBeUndefined()
    entry = { ...entry, command: '/Moved' }
    expect(make().sync()).toEqual(['alpha'])
    expect(existsSync(paths.alphaSkill())).toBe(false)
  })

  it('agent 被卸载（数据目录没了）时跳过并保留记录；表里没有的 agent 删掉记录', () => {
    make().install('alpha')
    make().install('beta')
    rmSync(join(home, '.alpha'), { recursive: true })
    version = '2.0.0'
    expect(make({ agents: [jsonAgent] }).sync()).toEqual([])
    const records = read(paths.records())
    expect(records.alpha).toBeDefined()
    expect(records.beta).toBeUndefined()
  })

  it('这个系统上没有的 agent 跳过；配置文件坏了只记日志', () => {
    writeFileSync(paths.records(), JSON.stringify({ gamma: { installedAt: 1 }, alpha: { installedAt: 1, skill: '1.0.0' } }))
    mkdirSync(join(home, '.alpha'))
    writeFileSync(paths.alphaMcp(), '{oops')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(make().sync()).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('多个配置文件', () => {
  const cli = () => join(home, '.alpha', 'cli.json')

  it('可选的文件只在已经存在时写；它缺了条目算需要更新，同步时补上', () => {
    make().install('alpha')
    expect(existsSync(cli())).toBe(false)
    writeFileSync(cli(), '{}')
    expect(byId(make().list()).alpha.outdated).toBe(true)
    expect(make().sync()).toEqual(['alpha'])
    expect(read(cli()).mcpServers['bili-downloader']).toEqual(entry)
    // 卸载时两个都删
    make().uninstall('alpha')
    expect(read(cli()).mcpServers).toEqual({})
  })

  it('可选的文件坏了也标出来，报的是它的路径', () => {
    make().install('alpha')
    writeFileSync(cli(), '{oops')
    expect(byId(make().list()).alpha).toMatchObject({ broken: true, configFile: cli() })
  })
})

describe('共用的 skill 目录', () => {
  const shared = (id: string): AgentDef => ({ ...noSkill, id, name: id, skills: (e) => join(e.home, '.agents', 'skills') })
  const sharedSkill = () => join(home, '.agents', 'skills', 'bili-downloader', 'SKILL.md')
  const agents = [shared('one'), { ...shared('two'), mcp: (e: AgentEnv) => [{ file: join(e.home, '.two.json'), format: 'json' as const, key: ['mcpServers'] }] }]

  it('还有别的 agent 在用时，卸载不删 skill；最后一个卸载时才删', () => {
    make({ agents }).install('one')
    make({ agents }).install('two')
    make({ agents }).uninstall('one')
    expect(existsSync(sharedSkill())).toBe(true)
    make({ agents }).uninstall('two')
    expect(existsSync(sharedSkill())).toBe(false)
  })

  it('共用目录是第一个装的 agent 新建的：不管先移除哪个，最后一个移除后 ~/.agents 也不在了', () => {
    for (const order of [['one', 'two'], ['two', 'one']]) {
      make({ agents }).install('one')
      make({ agents }).install('two')
      make({ agents }).uninstall(order[0])
      expect(existsSync(sharedSkill())).toBe(true)
      make({ agents }).uninstall(order[1])
      expect(existsSync(join(home, '.agents')), order.join()).toBe(false)
    }
  })

  it('共用目录的另一个 agent 已经整个卸载了，就不再算它在用', () => {
    make({ agents }).install('one')
    make({ agents }).install('two')
    rmSync(join(home, '.beta'), { recursive: true })
    make({ agents }).uninstall('two')
    expect(existsSync(sharedSkill())).toBe(false)
  })

  it('同步时发现某个 agent 的条目被删了，也不删别人还在用的 skill', () => {
    make({ agents }).install('one')
    make({ agents }).install('two')
    rmSync(paths.betaToml())
    mkdirSync(join(home, '.beta'), { recursive: true })
    expect(make({ agents }).sync()).toEqual([])
    expect(read(paths.records()).one).toBeUndefined()
    expect(existsSync(sharedSkill())).toBe(true)
  })
})

describe('检测不受我们写的东西影响', () => {
  it('本机没有的 agent 强制装上后仍是“未检测到”；目录里只有我们的配置、备份、skill 和系统文件都不算', () => {
    const list = byId(make().install('alpha'))
    expect(list.alpha).toMatchObject({ installed: true, detected: false })
    entry = { ...entry, command: '/Moved' }
    make().sync()
    expect(existsSync(`${paths.alphaMcp()}.bili-backup`)).toBe(true)
    writeFileSync(join(home, '.alpha', '.DS_Store'), '')
    expect(byId(make().list()).alpha.detected).toBe(false)
  })

  it('agent 自己写了东西（别的文件、配置里别的键）就算检测到', () => {
    make().install('alpha')
    writeFileSync(join(home, '.alpha', 'skills', 'other.md'), '')
    expect(byId(make().list()).alpha.detected).toBe(true)
    rmSync(join(home, '.alpha', 'skills', 'other.md'))
    const data = read(paths.alphaMcp())
    writeFileSync(paths.alphaMcp(), JSON.stringify({ ...data, theme: 'dark' }))
    expect(byId(make().list()).alpha.detected).toBe(true)
  })

  it('空目录不算；不是我们会写的位置（例如应用本体）存在就算', () => {
    mkdirSync(join(home, '.alpha'))
    expect(byId(make().list()).alpha.detected).toBe(false)
    const app = make({ agents: [{ ...jsonAgent, markers: (e) => [join(e.home, 'Alpha.app')] }] })
    mkdirSync(join(home, 'Alpha.app'))
    expect(byId(app.list()).alpha.detected).toBe(true)
  })
})

describe('移除后恢复原样', () => {
  it('本机没有的 agent：装上、更新、再移除，home 里什么都不剩', () => {
    make().install('alpha')
    make().install('beta')
    entry = { ...entry, command: '/Moved' }
    make().sync()
    make().uninstall('alpha')
    make().uninstall('beta')
    expect(tree()).toEqual([])
    expect(byId(make().list()).alpha).toMatchObject({ detected: false, installed: false })
  })

  it('装上之后 agent 才装好：它写过的文件和目录都留着，只删我们的', () => {
    make().install('alpha')
    presence(join(home, '.alpha'))
    writeFileSync(paths.alphaMcp(), JSON.stringify({ ...read(paths.alphaMcp()), theme: 'dark' }))
    make().uninstall('alpha')
    expect(read(paths.alphaMcp())).toEqual({ theme: 'dark', mcpServers: {} })
    // 改别人写过的文件前留的备份也留着
    expect(tree()).toEqual(['.alpha', join('.alpha', 'history.jsonl'), join('.alpha', 'mcp.json'), join('.alpha', 'mcp.json.bili-backup')])
  })

  it('本来就有的文件和目录不删，即使只剩空架子', () => {
    mkdirSync(join(home, '.alpha'))
    writeFileSync(paths.alphaMcp(), '{}')
    make().install('alpha')
    make().uninstall('alpha')
    expect(read(paths.alphaMcp())).toEqual({ mcpServers: {} })
    expect(tree()).toEqual(['.alpha', join('.alpha', 'mcp.json'), join('.alpha', 'mcp.json.bili-backup')])
  })

  it('重新安装、同步时新建的也记着，记录没有重复', () => {
    make().install('beta')
    make().install('beta')
    const created = read(paths.records()).beta.created
    expect(new Set(created).size).toBe(created.length)
    expect(created).toContain(paths.betaToml())
  })
})

describe('真实的 agent 表', () => {
  it.each(['darwin', 'win32', 'linux'] as const)('%s：全部装进空的 home 后仍是“未检测到”，全部移除后 home 恢复原样', (platform) => {
    const recordsDir = mkdtempSync(join(tmpdir(), 'agents-rec-'))
    try {
      // 只看 home 里的：/Applications 等真实位置上可能真的装着
      const e: AgentEnv = { ...agentEnv(platform, { BILI_AGENT_HOME: home }), exists: (p) => p.startsWith(home) && existsSync(p) }
      const integ = new Integrations({ file: join(recordsDir, 'r.json'), agents: AGENTS, env: e, version, entry: () => entry, enableMcp })
      const ids = AGENTS.filter((a) => !a.platforms || a.platforms.includes(platform)).map((a) => a.id)
      for (const id of ids) integ.install(id)
      // 更新一次，让已有的文件留下备份
      entry = { ...entry, command: '/Moved' }
      expect(integ.sync().sort()).toEqual([...ids].sort())
      const list = integ.list()
      expect(list.filter((s) => s.installed).map((s) => s.id)).toEqual(ids)
      expect(list.filter((s) => s.detected).map((s) => s.id)).toEqual([])
      for (const id of ids) integ.uninstall(id)
      expect(tree()).toEqual([])
    } finally {
      rmSync(recordsDir, { recursive: true, force: true })
    }
  })
})
