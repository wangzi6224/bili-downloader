// electron-builder 的 afterPack 钩子（打包后、签名前）：每个安装包只留本平台的 onnxruntime 二进制
const { join } = require('node:path')

/** electron-builder 的 Arch 枚举 */
const ARCH = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }

exports.default = async function afterPack(context) {
  const { pruneOrt } = await import('./lib/ortPrune.mjs')
  const platform = context.electronPlatformName
  const arch = ARCH[context.arch]
  const resources =
    platform === 'darwin'
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : join(context.appOutDir, 'resources')
  const removed = pruneOrt(join(resources, 'app.asar.unpacked', 'node_modules'), platform, arch)
  console.log(`  • 裁剪 onnxruntime（${platform}-${arch}）：删掉 ${removed.length} 个目录`)
}
