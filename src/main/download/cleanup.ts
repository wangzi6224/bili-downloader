import { readdirSync, rmdirSync, rmSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path'

/**
 * 成品旁边的附加文件（去掉成品主文件名后的部分）：封面、NFO、海报、弹幕、字幕。
 * 和 extras.ts 的 placeSidecars 一一对应，改那边的命名时这里一起改。
 */
const SIDECAR = /^(?:\.(?:jpg|png|nfo)|-poster\.(?:jpg|png)|\.danmaku\.(?:ass|xml)|\.[\w-]+\.srt)$/

/** 剧集目录里多集共用的文件，最后一集删掉后随目录一起删 */
const SHARED = new Set(['.DS_Store', 'tvshow.nfo', 'poster.jpg', 'poster.png'])

/** p 在 root 里面（不等于 root 本身） */
export function isInside(root: string, p: string): boolean {
  const rel = relative(root, p)
  return rel !== '' && !isAbsolute(rel) && rel.split(sep)[0] !== '..'
}

/** 和成品同名的附加文件 */
export function sidecarFiles(outputPath: string): string[] {
  const dir = dirname(outputPath)
  const base = basename(outputPath, extname(outputPath))
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.filter((n) => n.startsWith(base) && SIDECAR.test(n.slice(base.length))).map((n) => join(dir, n))
}

/** 从 dir 往上删掉空目录（只剩共用文件也算空），到 root 为止，root 本身不删 */
export function pruneDirs(dir: string, root: string): void {
  for (let d = dir; isInside(root, d); d = dirname(d)) {
    try {
      const names = readdirSync(d)
      if (names.some((n) => !SHARED.has(n))) return
      for (const n of names) rmSync(join(d, n), { force: true })
      rmdirSync(d)
    } catch {
      return
    }
  }
}

/**
 * 永久删除任务产出的文件：成品、附加文件、合并到一半的 .tmp，再清掉因此变空的目录。
 * 只删 root（任务的下载目录）里面的文件，返回没能删掉的路径。
 */
export function removeTaskOutputs(t: { outputPath?: string; tmpOutput?: string }, root: string): string[] {
  const files = [...(t.outputPath ? [t.outputPath, ...sidecarFiles(t.outputPath)] : []), ...(t.tmpOutput ? [t.tmpOutput] : [])]
  const failed: string[] = []
  for (const f of files) {
    if (!isInside(root, f)) continue
    try {
      rmSync(f, { force: true })
    } catch {
      failed.push(f)
    }
  }
  const anchor = t.outputPath ?? t.tmpOutput
  if (anchor) pruneDirs(dirname(anchor), root)
  return failed
}
