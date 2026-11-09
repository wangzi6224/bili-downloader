// AI 去水印用的 onnxruntime-node 自带所有系统的二进制（几百 MB），每个安装包只留自己那一份。
// 由 scripts/afterPack.cjs 在 electron-builder 打包后、签名前调用
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** 1.24 起没有 macOS Intel 版，Intel Mac 用 1.23（装在 onnxruntime-node-legacy） */
export const ortPackage = (platform, arch) => (platform === 'darwin' && arch === 'x64' ? 'onnxruntime-node-legacy' : 'onnxruntime-node')

const PACKAGES = ['onnxruntime-node', 'onnxruntime-node-legacy']

/**
 * 要删掉的目录（相对 node_modules）：用不到的那个包的 bin 整个删，用到的包只留本系统、本架构。
 * list(dir) 返回目录下的子目录名，目录不存在时返回 []
 */
export function prunePlan(platform, arch, list) {
  const keep = ortPackage(platform, arch)
  const remove = []
  for (const pkg of PACKAGES) {
    const bin = `${pkg}/bin`
    if (pkg !== keep) {
      if (list(bin).length) remove.push(bin)
      continue
    }
    for (const napi of list(bin)) {
      for (const os of list(`${bin}/${napi}`)) {
        if (os !== platform) {
          remove.push(`${bin}/${napi}/${os}`)
          continue
        }
        for (const a of list(`${bin}/${napi}/${os}`)) if (a !== arch) remove.push(`${bin}/${napi}/${os}/${a}`)
      }
    }
  }
  return remove
}

/** 在 node_modules 目录 root 下执行裁剪，返回删掉的目录 */
export function pruneOrt(root, platform, arch) {
  const list = (rel) => {
    const dir = join(root, rel)
    return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []
  }
  const remove = prunePlan(platform, arch, list)
  for (const rel of remove) rmSync(join(root, rel), { recursive: true, force: true })
  return remove
}
