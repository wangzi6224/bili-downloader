// 把 build/icon.svg 渲染成 macOS 应用图标：build/icon.icns（打包用）和 build/icon.png（开发时的程序坞图标）
// 生成物提交进仓库，只有改了 icon.svg 才需要重新运行
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const svg = readFileSync(join(buildDir, 'icon.svg'))

const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

// iconutil 要求的文件名：每个尺寸一张 1x、一张 2x
const iconset = join(mkdtempSync(join(tmpdir(), 'bili-icon-')), 'icon.iconset')
mkdirSync(iconset)
for (const size of [16, 32, 128, 256, 512]) {
  writeFileSync(join(iconset, `icon_${size}x${size}.png`), render(size))
  writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), render(size * 2))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(buildDir, 'icon.icns')])
rmSync(dirname(iconset), { recursive: true, force: true })

writeFileSync(join(buildDir, 'icon.png'), render(1024))
console.log('已生成 build/icon.icns 和 build/icon.png')
