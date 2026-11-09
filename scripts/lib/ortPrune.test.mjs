import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ortPackage, pruneOrt, prunePlan } from './ortPrune.mjs'

/** 和 npm 包里一样的目录结构 */
const TREE = {
  'onnxruntime-node/bin': ['napi-v6'],
  'onnxruntime-node/bin/napi-v6': ['darwin', 'linux', 'win32'],
  'onnxruntime-node/bin/napi-v6/darwin': ['arm64'],
  'onnxruntime-node/bin/napi-v6/linux': ['arm64', 'x64'],
  'onnxruntime-node/bin/napi-v6/win32': ['arm64', 'x64'],
  'onnxruntime-node-legacy/bin': ['napi-v6'],
  'onnxruntime-node-legacy/bin/napi-v6': ['darwin', 'linux', 'win32'],
  'onnxruntime-node-legacy/bin/napi-v6/darwin': ['arm64', 'x64'],
  'onnxruntime-node-legacy/bin/napi-v6/linux': ['arm64', 'x64'],
  'onnxruntime-node-legacy/bin/napi-v6/win32': ['arm64', 'x64']
}
const list = (dir) => TREE[dir] ?? []

describe('ortPackage', () => {
  it('只有 Intel Mac 用旧版', () => {
    expect(ortPackage('darwin', 'x64')).toBe('onnxruntime-node-legacy')
    expect(ortPackage('darwin', 'arm64')).toBe('onnxruntime-node')
    expect(ortPackage('win32', 'x64')).toBe('onnxruntime-node')
  })
})

describe('prunePlan', () => {
  it('Windows x64：只留新版的 win32/x64，旧版整个不要', () => {
    expect(prunePlan('win32', 'x64', list).sort()).toEqual(
      [
        'onnxruntime-node/bin/napi-v6/darwin',
        'onnxruntime-node/bin/napi-v6/linux',
        'onnxruntime-node/bin/napi-v6/win32/arm64',
        'onnxruntime-node-legacy/bin'
      ].sort()
    )
  })

  it('Intel Mac：新版整个不要，旧版只留 darwin/x64', () => {
    expect(prunePlan('darwin', 'x64', list).sort()).toEqual(
      [
        'onnxruntime-node/bin',
        'onnxruntime-node-legacy/bin/napi-v6/darwin/arm64',
        'onnxruntime-node-legacy/bin/napi-v6/linux',
        'onnxruntime-node-legacy/bin/napi-v6/win32'
      ].sort()
    )
  })

  it('包不存在时什么都不删', () => {
    expect(prunePlan('linux', 'x64', () => [])).toEqual([])
  })
})

describe('pruneOrt', () => {
  let root = ''
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ort-prune-'))
    for (const [dir, subs] of Object.entries(TREE)) for (const s of subs) mkdirSync(join(root, dir, s), { recursive: true })
    writeFileSync(join(root, 'onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node'), '')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('真的删掉目录，留下本平台的二进制', () => {
    const removed = pruneOrt(root, 'linux', 'x64')
    expect(removed.length).toBe(4)
    expect(existsSync(join(root, 'onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node'))).toBe(true)
    expect(existsSync(join(root, 'onnxruntime-node/bin/napi-v6/win32'))).toBe(false)
    expect(existsSync(join(root, 'onnxruntime-node-legacy/bin'))).toBe(false)
  })
})
