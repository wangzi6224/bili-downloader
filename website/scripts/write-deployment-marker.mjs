import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeDeploymentMarker } from './lib/deployment-marker.mjs'

const website = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputFile = resolve(website, 'out/deployment.json')
const { version } = JSON.parse(readFileSync(resolve(website, 'package.json'), 'utf8'))

try {
  writeFileSync(outputFile, serializeDeploymentMarker({ sha: process.env.GITHUB_SHA, version }))
  console.log(`✓ Pages 部署标记已写入 out/deployment.json（${version}）`)
} catch (error) {
  console.error(`✗ 无法写入 Pages 部署标记：${error.message}`)
  process.exitCode = 1
}
