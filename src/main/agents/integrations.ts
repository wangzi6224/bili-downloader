import { readdirSync, rmdirSync, rmSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { t } from '@shared/i18n'
import type { AgentStatus } from '@shared/types'
import { readJson, writeJson } from '../store'
import {
  backupPath,
  ConfigParseError,
  hasOtherContent,
  readEntry,
  removeEntry,
  removeIfEmpty,
  sameEntry,
  writeEntry,
  type ConfigTarget,
  type StdioEntry
} from './configFile'
import type { AgentDef, AgentEnv } from './registry'
import { installedSkillVersion, removeSkill, SKILL_NAME, writeSkill } from './skill'

/**
 * 把 MCP 和 skill 装进各个 agent，记下装过哪些，应用升级或挪了位置后自动更新。
 * 用户自己在 agent 里删掉的不再装回去；agent 整个卸载了就跳过，记录留着，重装 agent 后下次同步会补上。
 * 几个 agent 可能共用一个 skill 目录（~/.agents/skills）：还有别的 agent 在用时不删。
 * 移除后不留痕迹：安装时新建的文件和目录，只剩空架子的都删掉，本机没装的 agent 移除后仍然是“未检测到”。
 */

interface InstallRecord {
  /** 装 skill 时的版本；没装 skill 的为 undefined */
  skill?: string
  /** 安装时新建的文件和目录，移除时只收拾这些 */
  created?: string[]
  installedAt: number
}

type Records = Record<string, InstallRecord>

/** 所有 agent 里我们会写的东西：配置文件（和它们的备份）、skill 目录，以及它们的上级目录 */
interface Ours {
  files: Map<string, ConfigTarget>
  dirs: Set<string>
  parents: Set<string>
}

/** 系统自己放的文件，不算 agent 留下的，删空目录时一起删 */
const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

const union = (a: string[] | undefined, b: string[]): string[] | undefined => {
  const all = [...new Set([...(a ?? []), ...b])]
  return all.length ? all : undefined
}

/** 目录里只有系统文件时连它们一起删掉；返回是否删了 */
function removeEmptyDir(dir: string): boolean {
  try {
    const names = readdirSync(dir)
    if (names.some((n) => !JUNK.has(n))) return false
    for (const n of names) rmSync(join(dir, n), { force: true })
    rmdirSync(dir)
    return true
  } catch {
    return false
  }
}

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

  /** 这个 agent 里我们会写的路径：所有配置文件（含可选的）和 skill 目录 */
  private paths(a: AgentDef): string[] {
    const root = a.skills?.(this.deps.env)
    return [...a.mcp(this.deps.env).map((c) => c.file), ...(root ? [join(root, SKILL_NAME)] : [])]
  }

  private ours(): Ours {
    const files = new Map<string, ConfigTarget>()
    const dirs = new Set<string>()
    for (const a of this.deps.agents) {
      for (const c of a.mcp(this.deps.env)) {
        files.set(c.file, c)
        files.set(backupPath(c.file), { ...c, file: backupPath(c.file) })
      }
      const root = a.skills?.(this.deps.env)
      if (root) dirs.add(join(root, SKILL_NAME))
    }
    const parents = new Set<string>()
    for (const p of [...files.keys(), ...dirs]) {
      for (let d = dirname(p); d !== dirname(d) && !parents.has(d); d = dirname(d)) parents.add(d)
    }
    return { files, dirs, parents }
  }

  /**
   * 路径上有没有 agent 自己留下的东西。检测标记大多是 agent 的数据目录，我们安装时也往里写，
   * 只看目录在不在的话，本机没装的 agent 装过一次就会一直算“检测到”。
   * 所以我们写的配置文件只看里面有没有我们之外的内容，skill 目录不算，上级目录要看里面有没有别的
   */
  private traced(p: string, ours: Ours): boolean {
    const { exists, list } = this.deps.env
    if (!exists(p)) return false
    const target = ours.files.get(p)
    if (target) return hasOtherContent(target)
    if (ours.dirs.has(p)) return false
    if (!ours.parents.has(p)) return true
    return list(p).some((name) => !JUNK.has(name) && this.traced(join(p, name), ours))
  }

  /** 写之前还不存在的文件和上级目录 */
  private missing(paths: string[]): string[] {
    const out = new Set<string>()
    for (const p of paths) {
      for (let d = p; !out.has(d) && !this.deps.env.exists(d); d = dirname(d)) {
        out.add(d)
        if (dirname(d) === d) break
      }
    }
    return [...out]
  }

  list(): AgentStatus[] {
    const records = this.records()
    const ours = this.ours()
    return this.deps.agents.map((a) => this.status(a, records[a.id], ours))
  }

  private status(a: AgentDef, rec: InstallRecord | undefined, ours: Ours): AgentStatus {
    const targets = this.targets(a)
    const skillRoot = a.skills?.(this.deps.env)
    const base: AgentStatus = {
      id: a.id,
      name: a.name,
      supported: this.supported(a),
      detected: a.markers(this.deps.env).some((p) => this.traced(p, ours)),
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
    const { skill, created } = this.write(a, true)
    records[id] = { skill, created: union(records[id]?.created, created), installedAt: Date.now() }
    this.save(records)
  }

  /** 写配置和 skill，返回 skill 版本和新建了哪些文件、目录；同名 skill 是用户自己的就不碰 */
  private write(a: AgentDef, withSkill: boolean): { skill?: string; created: string[] } {
    const entry = this.deps.entry()
    const targets = this.targets(a)
    const root = a.skills?.(this.deps.env)
    const skillRoot = root && withSkill && installedSkillVersion(root) !== null ? root : undefined
    const created = this.missing([...targets.map((c) => c.file), ...(skillRoot ? [join(skillRoot, SKILL_NAME)] : [])])
    this.guard(a, () => targets.forEach((c) => writeEntry(c, entry)))
    if (!skillRoot) return { created }
    writeSkill(skillRoot, this.deps.version)
    return { skill: this.deps.version, created }
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

  /**
   * 条目已经删掉之后：删记录和我们的 skill，再把安装时新建、现在只剩空架子的文件和空目录删掉（由深到浅）。
   * 删不掉的如果还有别的 agent 在用（例如共用的 ~/.agents/skills），交给它，等它移除时再收拾
   */
  private forget(a: AgentDef, records: Records): void {
    const created = records[a.id]?.created ?? []
    delete records[a.id]
    this.dropSkill(a, records)
    const files = this.ours().files
    const left = [...created]
      .sort((x, y) => y.length - x.length)
      .filter((p) => {
        if (!this.deps.env.exists(p)) return false
        const target = files.get(p)
        return target ? !removeIfEmpty(target) : !removeEmptyDir(p)
      })
    for (const p of left) {
      const heir = Object.keys(records).find((id) => {
        const other = this.deps.agents.find((x) => x.id === id)
        return other && this.paths(other).some((q) => q === p || q.startsWith(p + sep))
      })
      if (heir) records[heir] = { ...records[heir], created: union(records[heir].created, [p]) }
    }
  }

  uninstall(id: string): AgentStatus[] {
    const a = this.agent(id)
    this.guard(a, () => a.mcp(this.deps.env).forEach((c) => removeEntry(c)))
    const records = this.records()
    this.forget(a, records)
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
    // 记录要现读：前面的 agent 被当作卸载时，会把没收拾掉的目录交给后面的
    for (const id of Object.keys(records)) {
      const rec = records[id]
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
          this.forget(a, records)
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
        const { skill, created } = this.write(a, keepSkill)
        records[id] = { ...records[id], skill, created: union(records[id].created, created) }
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
