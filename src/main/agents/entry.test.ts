import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bridgeEntry, installBridge } from './entry'

const base = { bridge: '/app.asar/out/main/bridge.js', userData: '/data' }
const env = { ELECTRON_RUN_AS_NODE: '1' }

describe('bridgeEntry', () => {
  it('macOS 运行 .app 里的可执行文件，启动时打开整个 .app', () => {
    expect(bridgeEntry({ ...base, platform: 'darwin', execPath: '/Applications/B站下载器.app/Contents/MacOS/B站下载器' })).toEqual({
      command: '/Applications/B站下载器.app/Contents/MacOS/B站下载器',
      args: [base.bridge, '--user-data', '/data', '--app', '/Applications/B站下载器.app'],
      env
    })
    // 开发时不在 .app 里
    expect(bridgeEntry({ ...base, platform: 'darwin', execPath: '/x/electron' }).args.at(-1)).toBe('/x/electron')
  })

  it('Linux 的 AppImage 用它本身的路径，deb 用可执行文件', () => {
    const appImage = bridgeEntry({ ...base, platform: 'linux', execPath: '/tmp/.mount_x/bili-downloader', appImage: '/home/u/B.AppImage' })
    expect(appImage.command).toBe('/home/u/B.AppImage')
    expect(appImage.args.at(-1)).toBe('/home/u/B.AppImage')
    expect(bridgeEntry({ ...base, platform: 'linux', execPath: '/opt/B站下载器/bili-downloader' }).command).toBe('/opt/B站下载器/bili-downloader')
  })

  it('Windows 用 exe，忽略 APPIMAGE', () => {
    const e = bridgeEntry({ ...base, platform: 'win32', execPath: 'C:\\P\\B站下载器.exe', appImage: '/x' })
    expect(e.command).toBe('C:\\P\\B站下载器.exe')
    expect(e.args.at(-1)).toBe('C:\\P\\B站下载器.exe')
  })

  it('额外的启动参数逐个用 --app-arg 传', () => {
    const e = bridgeEntry({ ...base, platform: 'linux', execPath: '/x/electron', appArgs: ['/proj', '--user-data-dir=/d'] })
    expect(e.args.slice(5)).toEqual(['--app-arg', '/proj', '--app-arg', '--user-data-dir=/d'])
  })
})

describe('installBridge', () => {
  it('复制到数据目录的固定位置，内容变了才重写', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-copy-'))
    try {
      const src = join(dir, 'bridge.js')
      writeFileSync(src, 'v1')
      const dest = installBridge(src, join(dir, 'data'))
      expect(dest).toBe(join(dir, 'data', 'mcp-bridge.js'))
      expect(readFileSync(dest, 'utf8')).toBe('v1')
      const mtime = statSync(dest).mtimeMs
      installBridge(src, join(dir, 'data'))
      expect(statSync(dest).mtimeMs).toBe(mtime)
      writeFileSync(src, 'v2')
      installBridge(src, join(dir, 'data'))
      expect(readFileSync(dest, 'utf8')).toBe('v2')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
