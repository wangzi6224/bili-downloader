import { execFile, spawn } from 'node:child_process'
import { accessSync, constants, mkdirSync, openSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

const run = promisify(execFile)

/**
 * 应用退出后由它替换 .app：没有开发者证书时 Squirrel.Mac（electron-updater）无法校验签名，
 * 所以自己换。替换失败就恢复旧版本，最后都会重新打开应用。
 * 参数：要等待退出的进程号、解压好的新版 .app、要替换的 .app
 * 导出供单元测试单独运行
 */
export const SCRIPT = `#!/bin/sh
pid="$1"; new="$2"; target="$3"
n=0
while kill -0 "$pid" 2>/dev/null; do
  n=$((n + 1))
  if [ "$n" -gt 600 ]; then echo "$(date) 等待旧版本退出超时"; exit 1; fi
  sleep 0.1
done
backup="$(dirname "$target")/.$(basename "$target").old"
rm -rf "$backup"
if mv "$target" "$backup"; then
  if mv "$new" "$target"; then
    rm -rf "$backup"
    echo "$(date) 已替换为新版本"
  else
    echo "$(date) 替换失败，恢复旧版本"
    rm -rf "$target"
    mv "$backup" "$target"
  fi
else
  echo "$(date) 无法移动旧版本，保持不变"
fi
xattr -dr com.apple.quarantine "$target" 2>/dev/null
touch "$target"
open "$target"
`

/** 正在运行的 .app，例如 /Applications/B站下载器.app */
export const appBundle = (): string => resolve(app.getPath('exe'), '../../..')

/** 不能自动替换应用的原因；可以替换时返回 undefined */
export function installBlocker(): string | undefined {
  if (!app.isPackaged) return '开发模式下不能自动安装，请用打包后的应用测试'
  if (process.platform !== 'darwin') return '自动安装只支持 macOS'
  const bundle = appBundle()
  if (!bundle.endsWith('.app')) return `找不到应用所在的位置（${bundle}）`
  // 没拖进“应用程序”就直接打开时，macOS 会把应用放到一个只读的随机路径里运行
  const moveFirst = '请先把应用拖到“应用程序”文件夹，从那里打开后再更新'
  if (bundle.includes('/AppTranslocation/')) return `应用是从“下载”文件夹里直接打开的，${moveFirst}`
  try {
    accessSync(dirname(bundle), constants.W_OK)
    accessSync(bundle, constants.W_OK)
  } catch {
    return bundle.startsWith('/Volumes/') ? `应用正在磁盘映像里运行，${moveFirst}` : `没有权限修改 ${dirname(bundle)}`
  }
  return undefined
}

async function plistValue(bundle: string, key: string): Promise<string> {
  const { stdout } = await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', join(bundle, 'Contents', 'Info.plist')])
  return stdout.trim()
}

/** 解压安装包，确认是本应用的指定版本，返回解压出的 .app */
export async function unpack(zip: string, dir: string, version: string): Promise<string> {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  // ditto 能正确还原 Electron Framework 里的符号链接
  await run('/usr/bin/ditto', ['-x', '-k', zip, dir])
  const name = readdirSync(dir).find((n) => n.endsWith('.app'))
  if (!name) throw new Error('安装包里没有找到应用')
  const next = join(dir, name)
  const [id, ver, ownId] = await Promise.all([
    plistValue(next, 'CFBundleIdentifier'),
    plistValue(next, 'CFBundleShortVersionString'),
    plistValue(appBundle(), 'CFBundleIdentifier')
  ])
  if (id !== ownId) throw new Error(`安装包不是本应用（${id}）`)
  if (ver !== version) throw new Error(`安装包的版本是 ${ver}，不是 ${version}`)
  return next
}

/** 启动独立的替换脚本；调用方随后退出应用 */
export function replaceAfterExit(next: string, workDir: string, log: string): void {
  const script = join(workDir, 'install.sh')
  writeFileSync(script, SCRIPT, { mode: 0o755 })
  const out = openSync(log, 'a')
  spawn('/bin/sh', [script, String(process.pid), next, appBundle()], { detached: true, stdio: ['ignore', out, out] }).unref()
}
