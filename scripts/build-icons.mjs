// 把 build/icon.svg 渲染成应用图标：build/icon.png（开发时的程序坞图标）、build/icons/<尺寸>.png（Linux 包和窗口、托盘用），
// 以及 macOS 打包用的 build/icon.icns
// 把 build/tray.svg 渲染成 macOS 菜单栏图标：build/trayTemplate.png 和 trayTemplate@2x.png
// 把 build/dmg-background.svg 渲染成 dmg 安装窗口背景：build/background.png 和 background@2x.png
// icns 要用 iconutil、dmg 背景要用系统自带的冬青黑体，只在 macOS 上生成；其他系统上只生成 png
// 生成物提交进仓库，只有改了这些 svg 才需要重新运行
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { encodeIco } from './lib/ico.mjs'

const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const svg = readFileSync(join(buildDir, 'icon.svg'))

const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

writeFileSync(join(buildDir, 'icon.png'), render(1024))

// 图标主题（hicolor）最大只有 512x512，electron-builder 按文件名的尺寸装进 /usr/share/icons/hicolor/<尺寸>/apps
const linuxIcons = join(buildDir, 'icons')
mkdirSync(linuxIcons, { recursive: true })
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  writeFileSync(join(linuxIcons, `${size}x${size}.png`), render(size))
}
writeFileSync(
  join(buildDir, 'icon.ico'),
  encodeIco([16, 32, 48, 64, 128, 256].map((size) => ({ size, data: render(size) })))
)

// 文件名以 Template 结尾，Electron 才会当成 template 图片交给系统着色；读 1x 时会一并读入同名的 @2x
const traySvg = readFileSync(join(buildDir, 'tray.svg'))
const renderTray = (size) => new Resvg(traySvg, { fitTo: { mode: 'width', value: size } }).render().asPng()
writeFileSync(join(buildDir, 'trayTemplate.png'), renderTray(18))
writeFileSync(join(buildDir, 'trayTemplate@2x.png'), renderTray(36))

if (process.platform !== 'darwin') {
  console.log('已生成 build/icon.png、build/icon.ico、build/icons/ 和 build/trayTemplate{,@2x}.png；icns 和 dmg 背景只能在 macOS 上生成，已跳过')
  process.exit(0)
}

// iconutil 要求的文件名：每个尺寸一张 1x、一张 2x
const iconset = join(mkdtempSync(join(tmpdir(), 'bili-icon-')), 'icon.iconset')
mkdirSync(iconset)
for (const size of [16, 32, 128, 256, 512]) {
  writeFileSync(join(iconset, `icon_${size}x${size}.png`), render(size))
  writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), render(size * 2))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(buildDir, 'icon.icns')])
rmSync(dirname(iconset), { recursive: true, force: true })

// electron-builder 发现 background@2x.png 会自动和 1x 合成 Retina 的 tiff；文字用系统自带的冬青黑体
const dmgSvg = readFileSync(join(buildDir, 'dmg-background.svg'))
const font = { loadSystemFonts: true, defaultFontFamily: 'Hiragino Sans GB' }
const renderDmg = (width) => new Resvg(dmgSvg, { fitTo: { mode: 'width', value: width }, font }).render().asPng()
writeFileSync(join(buildDir, 'background.png'), renderDmg(540))
writeFileSync(join(buildDir, 'background@2x.png'), renderDmg(1080))
console.log('已生成 build/icon.icns、build/icon.ico、build/icon.png、build/icons/、build/trayTemplate{,@2x}.png 和 build/background{,@2x}.png')
