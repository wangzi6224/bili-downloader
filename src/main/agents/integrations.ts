import { t } from '@shared/i18n'
import type { AgentStatus } from '@shared/types'
import { readJson, writeJson } from '../store'
import { ConfigParseError, readEntry, removeEntry, sameEntry, writeEntry, type ConfigTarget, type StdioEntry } from './configFile'
import type { AgentDef, AgentEnv } from './registry'
import { installedSkillVersion, removeSkill, writeSkill } from './skill'

/**
 * 把 MCP 和 skill 装进各个 agent，记下装过哪些，应用升级或挪了位置后自动更新。
 * 用户自己在 agent 里删掉的不再装回去；agent 整个卸载了就跳过，记录留着，重装 agent 后下次同步会补上。
 * 几个 agent 可能共用一个 skill 目录（~/.agents/skills）：还有别的 agent 在用时不删。
 */

interface InstallRecord {
  /** 装 skill 时的版本；没装 skill 的为 undefined */
  skill?: string
  installedAt: number
}

type Records = Record<string, InstallRecord>

export interface IntegrationDeps {
  file: string
  agents: AgentDef[]
  env: AgentEnv
  /** 当前应用版本 */
  version: string
  /** 写进配置的启动方式（应用位置变了它也跟着变） */
  entry: () => StdioEntry
  /** 安装时确保 MCP 服务是开着的 */
  enableMcp: () => void
}

export class Integrations {
  constructor(private deps: IntegrationDeps) {}

  private records(): Records {
    const r = readJson<Records>(this.deps.file)
    return r && typeof r === 'object' && !Array.isArray(r) ? r : {}
  }

  private save(r: Records): void {
    writeJson(this.deps.file, r)
  }

  private agent(id: string): AgentDef {
    const a = this.deps.agents.find((x) => x.id === id)
    if (!a) throw new Error(t('agents.unknown', { id }))
    return a
  }

  private supported(a: AgentDef): boolean {
    return !a.platforms || a.platforms.includes(this.deps.env.platform)
  }

  /**
   * 条目是不是这个应用实例写的（参数里带着本实例的数据目录）。
   * 用户自己换成了别的配置（例如手写的 HTTP 版），或者是别的数据目录的实例写的，同步时都不能覆盖
   */
  private owns(e: Partial<StdioEntry> | undefined): boolean {
    const want = this.deps.entry().args
    const userData = want[want.indexOf('--user-data') + 1]
    return !!e && Array.isArray(e.args) && e.args.includes('--user-data') && e.args[e.args.indexOf('--user-data') + 1] === userData
  }

  /** 要写的配置文件：可选的那些只在已经存在时写 */
  private targets(a: AgentDef): ConfigTarget[] {
    return a.mcp(this.deps.env).filter((c, i) => i === 0 || !c.optional || this.deps.env.exists(c.file))
  }

  /** 配置文件读不懂时换成带 agent 名字的说明 */
  private guard<T>(a: AgentDef, fn: () => T): T {
    try {
      return fn()
    } catch (e) {
      if (e instanceof ConfigParseError) throw new Error(t('agents.configBroken', { name: a.name, file: e.file }))
      throw e
    }
  }

  list(): AgentStatus[] {
    const records = this.records()
    return this.deps.agents.map((a) => this.status(a, records[a.id]))
  }

  private status(a: AgentDef, rec: InstallRecord | undefined): AgentStatus {
    const targets = this.targets(a)
    const skillRoot = a.skills?.(this.deps.env)
    const base: AgentStatus = {
      id: a.id,
      name: a.name,
      supported: this.supported(a),
      detected: a.markers(this.deps.env).some((p) => this.deps.env.exists(p)),
      installed: false,
      outdated: false,
      skill: !!skillRoot,
      configFile: targets[0].file,
      note: a.note
    }
    if (!base.supported) return base
    const skillVersion = skillRoot ? installedSkillVersion(skillRoot) : undefined
    if (skillVersion === null) base.skillConflict = true
    let entries
    try {
      entries = targets.map((c) => readEntry(c))
    } catch (e) {
      if (e instanceof ConfigParseError) return { ...base, broken: true, configFile: e.file }
      throw e
    }
    if (!rec || !this.owns(entries[0])) return base
    const entry = this.deps.entry()
    const skillStale = rec.skill !== undefined && typeof skillVersion === 'string' && skillVersion !== this.deps.version
    return { ...base, installed: true, outdated: entries.some((e) => !sameEntry(e, entry)) || skillStale }
  }

  install(id: string): AgentStatus[] {
    this.installOne(id)
    return this.list()
  }

  private installOne(id: string): void {
    const a = this.agent(id)
    if (!this.supported(a)) throw new Error(t('agents.unsupported', { name: a.name }))
    this.deps.enableMcp()
    const records = this.records()
    records[id] = { ...this.write(a, true), installedAt: Date.now() }
    this.save(records)
  }

  /** 写配置和 skill；同名 skill 是用户自己的就不碰 */
  private write(a: AgentDef, withSkill: boolean): { skill?: string } {
    const entry = this.deps.entry()
    this.guard(a, () => this.targets(a).forEach((c) => writeEntry(c, entry)))
    const root = a.skills?.(this.deps.env)
    if (!root || !withSkill || installedSkillVersion(root) === null) return {}
    writeSkill(root, this.deps.version)
    return { skill: this.deps.version }
  }

  /** 删掉这个 agent 的 skill，除非别的装过的 agent 也在用这个目录（agent 本身已经被卸载的不算） */
  private dropSkill(a: AgentDef, records: Records): void {
    const root = a.skills?.(this.deps.env)
    if (!root) return
    const shared = Object.entries(records).some(([id, rec]) => {
      if (id === a.id || rec.skill === undefined) return false
      const other = this.deps.agents.find((x) => x.id === id)
      return other?.skills?.(this.deps.env) === root && this.deps.env.exists(other.root(this.deps.env))
    })
    if (!shared) removeSkill(root)
  }

  uninstall(id: string): AgentStatus[] {
    const a = this.agent(id)
    this.guard(a, () => a.mcp(this.deps.env).forEach((c) => removeEntry(c)))
    const records = this.records()
    this.dropSkill(a, records)
    delete records[id]
    this.save(records)
    return this.list()
  }

  /** 给检测到、能装、还没装的全部装上；某一个失败不影响其他的，最后把失败的原因一起报出来 */
  installAll(): AgentStatus[] {
    const errors: string[] = []
    for (const s of this.list()) {
      if (!s.supported || !s.detected || s.installed || s.broken) continue
      try {
        this.installOne(s.id)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length) throw new Error(errors.join('\n'))
    return this.list()
  }

  /**
   * 启动时调用：装过的 agent 里，配置还在但版本或应用位置变了的就重写。
   * 主配置文件里的条目被用户删掉了就当作卸载（我们的 skill 一并删掉）；只删了 skill 就不再补 skill。
   * 返回更新了的 agent id。
   */
  sync(): string[] {
    const records = this.records()
    const updated: string[] = []
    let changed = false
    const entry = this.deps.entry()
    for (const [id, rec] of Object.entries(records)) {
      const a = this.deps.agents.find((x) => x.id === id)
      if (!a) {
        delete records[id]
        changed = true
        continue
      }
      // agent 被卸载了：先不动，等它装回来
      if (!this.supported(a) || !this.deps.env.exists(a.root(this.deps.env))) continue
      try {
        const entries = this.targets(a).map((c) => readEntry(c))
        const root = a.skills?.(this.deps.env)
        // 条目被删了，或者被换成了不是我们写的配置：当作用户卸载了
        if (!this.owns(entries[0])) {
          delete records[id]
          this.dropSkill(a, records)
          changed = true
          continue
        }
        const skillVersion = root ? installedSkillVersion(root) : undefined
        const keepSkill = rec.skill !== undefined && typeof skillVersion === 'string'
        if (rec.skill !== undefined && !keepSkill) {
          records[id] = { ...rec, skill: undefined }
          changed = true
        }
        if (entries.every((e) => sameEntry(e, entry)) && (!keepSkill || skillVersion === this.deps.version)) continue
        records[id] = { ...records[id], ...this.write(a, keepSkill) }
        changed = true
        updated.push(id)
      } catch (e) {
        // 配置文件读不懂或写不了：这次跳过，界面上会显示出来
        console.warn(`更新 ${a.name} 的 MCP 配置失败`, e)
      }
    }
    if (changed) this.save(records)
    return updated
  }
}
