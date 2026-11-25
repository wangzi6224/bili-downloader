import { execFile, spawn } from 'node:child_process'
import { accessSync, chmodSync, closeSync, constants, copyFileSync, mkdirSync, openSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { t } from '@shared/i18n'
import { encodeCommand, POWERSHELL } from '../powershell'

const run = promisify(execFile)

/**
 * 应用退出后由它替换 .app：不用 Squirrel.Mac（electron-updater），自己换。0.17.1 及更早的版本是 ad-hoc 签名，
 * Squirrel.Mac 无法校验，这套流程因此保留下来。替换失败就恢复旧版本，最后都会重新打开应用。
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

/**
 * Linux 版：应用退出后用新的 AppImage 覆盖原来的文件（路径不变，用户建的启动器照样能用），再重新打开。
 * 新文件事先已经放在同一个目录里，mv 是原子的；替换失败就删掉新文件、保留旧版本。
 * 用 bash 跑：要关掉 9 号以后的文件描述符，dash 做不到（AppImage 的启动脚本本来就要 bash）
 * 参数：要等待退出的进程号、新的 AppImage、要替换的 AppImage
 */
export const APPIMAGE_SCRIPT = `#!/bin/bash
pid="$1"; new="$2"; target="$3"
n=0
while kill -0 "$pid" 2>/dev/null; do
  n=$((n + 1))
  if [ "$n" -gt 600 ]; then echo "$(date) 等待旧版本退出超时"; rm -f "$new"; exit 1; fi
  sleep 0.1
done
if mv -f "$new" "$target"; then
  echo "$(date) 已替换为新版本"
else
  echo "$(date) 替换失败，保持旧版本"
  rm -f "$new"
fi
(
  # 旧版本打开的文件（app.asar 等，在旧 AppImage 的挂载目录里）会一路传到这里，带给新版本的话旧版本就一直卸载不掉
  for fd in /dev/fd/*; do
    fd="\${fd##*/}"
    [ "$fd" -gt 2 ] 2>/dev/null && eval "exec $fd>&-" 2>/dev/null
  done
  # 这些变量是旧版本的 AppImage 运行时设的，指向已经卸载的目录
  cd "$(dirname "$target")" && exec env -u APPDIR -u APPIMAGE -u ARGV0 -u OWD "$target"
) >/dev/null 2>&1 &
`

/** Windows 更新脚本没装上新版本时把原因写在更新目录的这个文件里，旧版本重新打开后读出来提示用户 */
export const INSTALL_RESULT = 'last-install.json'

/**
 * Windows 版：旧进程退出后结束它留下的 ffmpeg（运行中的 exe 换不掉），静默运行 NSIS 安装器，最后重新打开应用。
 * 用 -EncodedCommand 运行，不受执行策略限制；参数从环境变量传进来，用完就删掉，免得带给安装器和新版本。
 * 失败时在 INSTALL_RESULT 里记下版本、Win32 错误码（认出智能应用控制等系统策略的拦截）、安装器退出码和原文
 */
export const WINDOWS_UPDATE_SCRIPT = [
  '$OldPid = [int]$env:BILI_UPDATE_PID; $Installer = $env:BILI_UPDATE_INSTALLER; $AppExe = $env:BILI_UPDATE_APP; $Log = $env:BILI_UPDATE_LOG',
  '$Result = $env:BILI_UPDATE_RESULT; $Version = $env:BILI_UPDATE_VERSION; $NsisExit = $null',
  "Remove-Item -Path 'Env:BILI_UPDATE_*'",
  // update.log 是 UTF-8，Windows PowerShell 默认按系统代码页写，中文会乱码；标准输出也指向这个文件，要允许别人同时写
  'function Write-Log([string]$Message) {',
  '  $bytes = [Text.Encoding]::UTF8.GetBytes("$(Get-Date -Format o) $Message`r`n")',
  "  $stream = [IO.File]::Open($Log, 'Append', 'Write', 'ReadWrite')",
  '  try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }',
  '}',
  '$AppDir = Split-Path -Parent $AppExe',
  'try {',
  '  if (Get-Process -Id $OldPid -ErrorAction SilentlyContinue) { Wait-Process -Id $OldPid -Timeout 120 -ErrorAction Stop }',
  "  $ffmpeg = Join-Path $AppDir 'resources\\ffmpeg\\ffmpeg.exe'",
  '  $left = @(Get-Process -Name ffmpeg -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ffmpeg })',
  '  if ($left.Count) { $left | Stop-Process -Force; $left | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue }',
  // --updated：按更新处理，用户删掉的桌面快捷方式不会再建回来。
  // 不用 Start-Process：它出错时只留下文字，丢掉了 Win32 错误码
  "  $psi = New-Object Diagnostics.ProcessStartInfo -Property @{ FileName = $Installer; Arguments = '/S --updated'; WindowStyle = 'Hidden'; UseShellExecute = $true }",
  '  $updated = [Diagnostics.Process]::Start($psi); $updated.WaitForExit(); $NsisExit = $updated.ExitCode',
  '  if ($NsisExit -ne 0) { throw "NSIS 退出码 $NsisExit" }',
  "  Write-Log '已安装新版本'",
  '} catch {',
  '  Write-Log "更新失败：$($_.Exception.Message)"',
  '  $e = $_.Exception; while ($e -and $e -isnot [ComponentModel.Win32Exception]) { $e = $e.InnerException }',
  '  $code = if ($e) { $e.NativeErrorCode } else { 0 }',
  '  $failure = @{ version = $Version; code = $code; exit = $NsisExit; message = $_.Exception.Message } | ConvertTo-Json -Compress',
  '  try { [IO.File]::WriteAllText($Result, $failure) } catch { Write-Log "记录失败原因失败：$($_.Exception.Message)" }',
  '} finally {',
  // 不能带 -WindowStyle Hidden：它会作用到新版本第一次显示窗口，主窗口就出不来了
  '  try { Start-Process -FilePath $AppExe -WorkingDirectory $AppDir } catch { Write-Log "重新打开失败：$($_.Exception.Message)" }',
  '}'
].join('\n')

/**
 * Windows 版的启动器：拉起真正的更新脚本后马上退出。不能直接 detached 启动更新脚本：detached 的 PowerShell
 * 没有控制台，在部分 Windows 11 上一启动就退出，什么都不执行（0.12.0 起的自动更新因此一直装不上）；
 * 不 detached 的子进程又在 libuv 的作业对象里，应用退出时会被一起结束。
 * Start-Process 拉起的孙进程会静默脱离这个作业对象（libuv 允许），应用退出后照样运行
 */
export const WINDOWS_LAUNCHER =
  // 输出重定向到日志时，PowerShell 加载模块的进度会以 CLIXML 写进去
  "$ProgressPreference = 'SilentlyContinue'; Start-Process -FilePath $env:BILI_UPDATE_PS -ArgumentList '-NoProfile', '-NonInteractive', '-EncodedCommand', $env:BILI_UPDATE_SCRIPT -WindowStyle Hidden"

/** 启动器冷启动 PowerShell 一般要几秒，超过这个时间还没退出就当作失败 */
const LAUNCH_TIMEOUT_MS = 60_000

/** 正在运行的 .app，例如 /Applications/B站下载器.app */
export const appBundle = (): string => resolve(app.getPath('exe'), '../../..')

/** 正在运行的 AppImage 文件：AppImage 运行时会设置这个变量，deb 等方式安装的没有 */
const appImage = (): string | undefined => process.env.APPIMAGE

/** 不能自动替换应用的原因；可以替换时返回 undefined */
export function installBlocker(): string | undefined {
  if (!app.isPackaged) return t('updateErr.devMode')
  if (process.platform === 'linux') return appImageBlocker()
  if (process.platform === 'win32') return nsisBlocker()
  if (process.platform !== 'darwin') return t('updateErr.unsupportedOs')
  const bundle = appBundle()
  if (!bundle.endsWith('.app')) return t('updateErr.appNotFound', { path: bundle })
  // 没拖进“应用程序”就直接打开时，macOS 会把应用放到一个只读的随机路径里运行
  const hint = t('updateErr.moveFirst')
  if (bundle.includes('/AppTranslocation/')) return t('updateErr.translocated', { hint })
  try {
    accessSync(dirname(bundle), constants.W_OK)
    accessSync(bundle, constants.W_OK)
  } catch {
    return bundle.startsWith('/Volumes/') ? t('updateErr.inDiskImage', { hint }) : t('updateErr.noWritePermission', { dir: dirname(bundle) })
  }
  return undefined
}

function appImageBlocker(): string | undefined {
  const file = appImage()
  if (!file) return t('updateErr.appImageOnly')
  try {
    accessSync(dirname(file), constants.W_OK)
    accessSync(file, constants.W_OK)
  } catch {
    return t('updateErr.noWritePermission', { dir: dirname(file) })
  }
  return undefined
}

/** Windows：静默安装总是装回安装器记下的位置，只有从那里运行的（旁边有卸载程序）才能自动更新，别处拷来的更新完还是旧版本 */
function nsisBlocker(): string | undefined {
  const dir = dirname(app.getPath('exe'))
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    // 读不了目录也当作不是安装版
  }
  if (!names.some((n) => /^Uninstall .+\.exe$/i.test(n))) return t('updateErr.installerOnly')
  // Windows 上 access() 不看文件夹的权限设置（ACL），只能真的写一下试试
  const probe = join(dir, `.update-check-${process.pid}`)
  try {
    writeFileSync(probe, '')
    rmSync(probe)
  } catch {
    return t('updateErr.noWritePermission', { dir })
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
  if (!name) throw new Error(t('updateErr.noAppInPackage'))
  const next = join(dir, name)
  const [id, ver, ownId] = await Promise.all([
    plistValue(next, 'CFBundleIdentifier'),
    plistValue(next, 'CFBundleShortVersionString'),
    plistValue(appBundle(), 'CFBundleIdentifier')
  ])
  if (id !== ownId) throw new Error(t('updateErr.notThisApp', { id }))
  if (ver !== version) throw new Error(t('updateErr.versionMismatch', { actual: ver, expected: version }))
  return next
}

/**
 * 把校验过的新 AppImage 复制到原来的 AppImage 旁边（同一个文件系统，替换时才能原子地 mv），返回它的路径。
 * 下载的安装包已经按 update.json 里的 sha512 校验过，这里不再检查内容
 */
export function stageAppImage(file: string): string {
  const target = appImage()
  if (!target) throw new Error(t('updateErr.appImageOnly'))
  const next = join(dirname(target), `.${basename(target)}.new`)
  copyFileSync(file, next)
  chmodSync(next, 0o755)
  return next
}

/** 准备好要换上的新版本：macOS 解压 .app，Linux 暂存 AppImage，Windows 保留 NSIS 安装器 */
export const prepare = (pkg: string, stageDir: string, version: string): Promise<string> => {
  if (process.platform === 'darwin') return unpack(pkg, stageDir, version)
  if (process.platform === 'linux') return Promise.resolve().then(() => stageAppImage(pkg))
  if (process.platform === 'win32') return Promise.resolve(pkg)
  return Promise.reject(new Error(t('updateErr.platformUnsupported', { platform: process.platform })))
}

/** Windows：等启动器拉起更新脚本并退出；启动器没起来、出错或超时都报错，调用方就不会退出应用 */
function launchWindowsUpdate(next: string, workDir: string, log: string, version: string): Promise<void> {
  const out = openSync(log, 'a')
  return new Promise((resolve, reject) => {
    const child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeCommand(WINDOWS_LAUNCHER)], {
      cwd: workDir,
      windowsHide: true,
      stdio: ['ignore', out, out],
      env: {
        ...process.env,
        BILI_UPDATE_PS: POWERSHELL,
        BILI_UPDATE_SCRIPT: encodeCommand(WINDOWS_UPDATE_SCRIPT),
        BILI_UPDATE_PID: String(process.pid),
        BILI_UPDATE_INSTALLER: next,
        BILI_UPDATE_APP: app.getPath('exe'),
        BILI_UPDATE_LOG: log,
        BILI_UPDATE_RESULT: join(workDir, INSTALL_RESULT),
        BILI_UPDATE_VERSION: version
      }
    })
    const timer = setTimeout(() => child.kill(), LAUNCH_TIMEOUT_MS)
    let settled = false
    const done = (error?: unknown): void => {
      // 启动失败时 error 之后可能还有 exit
      if (settled) return
      settled = true
      clearTimeout(timer)
      closeSync(out)
      if (error === undefined) return resolve()
      console.error('更新脚本没有启动', error)
      reject(new Error(t('updateErr.launchFailed')))
    }
    child.once('error', done)
    child.once('exit', (code) => (code === 0 ? done() : done(new Error(`启动器退出码 ${code}`))))
  })
}

/** 启动独立的替换脚本；完成后调用方退出应用。version 是要装的新版本 */
export function replaceAfterExit(next: string, workDir: string, log: string, version: string): Promise<void> {
  if (process.platform === 'win32') return launchWindowsUpdate(next, workDir, log, version)
  const mac = process.platform === 'darwin'
  const script = join(workDir, 'install.sh')
  writeFileSync(script, mac ? SCRIPT : APPIMAGE_SCRIPT, { mode: 0o755 })
  const out = openSync(log, 'a')
  const target = mac ? appBundle() : appImage()!
  // 工作目录放在更新目录里：AppImage 退出后它挂载的目录就没了
  spawn(mac ? '/bin/sh' : '/bin/bash', [script, String(process.pid), next, target], {
    cwd: workDir,
    detached: true,
    stdio: ['ignore', out, out]
  }).unref()
  return Promise.resolve()
}
