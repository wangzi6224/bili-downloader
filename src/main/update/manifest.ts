import type { ReleaseNote } from '@shared/types'

/** 发布脚本生成的 update.json，随每个 Release 一起上传 */
export interface Manifest {
  version: string
  date: string
  page: string
  notes: ReleaseNote[]
  files: Partial<Record<string, ManifestFile>>
}

export interface ManifestFile {
  url: string
  /** base64 */
  sha512: string
  size: number
}

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/** 比较 x.y.z 版本号；带预发布后缀（如 1.0.0-beta.1）的比正式版小 */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION_RE.exec(a.trim())
  const pb = VERSION_RE.exec(b.trim())
  if (!pa || !pb) throw new Error(`版本号格式不对：${pa ? b : a}`)
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d) return Math.sign(d)
  }
  const [ra, rb] = [pa[4], pb[4]]
  if (!ra || !rb) return ra ? -1 : rb ? 1 : 0
  const xa = ra.split('.')
  const xb = rb.split('.')
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    if (xa[i] === undefined) return -1
    if (xb[i] === undefined) return 1
    const [na, nb] = [Number(xa[i]), Number(xb[i])]
    const d = Number.isInteger(na) && Number.isInteger(nb) ? na - nb : xa[i].localeCompare(xb[i])
    if (d) return Math.sign(d)
  }
  return 0
}

const isStr = (v: unknown): v is string => typeof v === 'string'

function invalid(what: string): never {
  throw new Error(`更新信息格式不对：${what}`)
}

/** 只接受 https；allowLocal 时额外放行本机 http，用于在本地测试更新流程 */
const safeUrl = (u: unknown, allowLocal: boolean): u is string =>
  isStr(u) && (u.startsWith('https://') || (allowLocal && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u)))

/** 校验下载到的 update.json，格式不对时抛错 */
export function parseManifest(data: unknown, allowLocal = false): Manifest {
  if (!data || typeof data !== 'object') invalid('不是 JSON 对象')
  const m = data as Record<string, unknown>
  if (!isStr(m.version) || !VERSION_RE.test(m.version)) invalid('version')
  if (!safeUrl(m.page, allowLocal)) invalid('page')
  if (!m.files || typeof m.files !== 'object') invalid('files')
  const files: Manifest['files'] = {}
  for (const [arch, f] of Object.entries(m.files as Record<string, Partial<ManifestFile> | null>)) {
    if (!f || !safeUrl(f.url, allowLocal)) invalid(`files.${arch}.url`)
    if (!isStr(f.sha512) || !f.sha512) invalid(`files.${arch}.sha512`)
    if (typeof f.size !== 'number' || f.size <= 0) invalid(`files.${arch}.size`)
    files[arch] = { url: f.url, sha512: f.sha512, size: f.size }
  }
  const notes: ReleaseNote[] = []
  for (const n of Array.isArray(m.notes) ? (m.notes as Partial<ReleaseNote>[]) : []) {
    if (n && isStr(n.version) && VERSION_RE.test(n.version) && isStr(n.body)) {
      notes.push({ version: n.version, date: isStr(n.date) ? n.date : '', body: n.body })
    }
  }
  return { version: m.version, date: isStr(m.date) ? m.date : '', page: m.page, notes, files }
}

/** 介于当前版本（不含）和最新版本（含）之间的说明，新的在前 */
export function notesSince(notes: ReleaseNote[], current: string, latest: string): ReleaseNote[] {
  return notes
    .filter((n) => compareVersions(n.version, current) > 0 && compareVersions(n.version, latest) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
