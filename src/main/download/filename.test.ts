import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sanitize, uniquePath } from './filename'

let root = ''
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'filename-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('uniquePath', () => {
  it('不存在时原样返回', () => {
    expect(uniquePath(join(root, '视频'), '.mp4')).toBe(join(root, '视频.mp4'))
  })

  it('已存在时依次加 (1)、(2)…', () => {
    writeFileSync(join(root, '视频.mp4'), '')
    expect(uniquePath(join(root, '视频'), '.mp4')).toBe(join(root, '视频 (1).mp4'))
    writeFileSync(join(root, '视频 (1).mp4'), '')
    writeFileSync(join(root, '视频 (2).mp4'), '')
    expect(uniquePath(join(root, '视频'), '.mp4')).toBe(join(root, '视频 (3).mp4'))
  })

  it('被占用的名字也跳过', () => {
    const taken = new Set([join(root, '视频.mp4'), join(root, '视频 (1).mp4')])
    expect(uniquePath(join(root, '视频'), '.mp4', (p) => taken.has(p))).toBe(join(root, '视频 (2).mp4'))
  })

  it('只看同扩展名', () => {
    writeFileSync(join(root, '视频.mkv'), '')
    expect(uniquePath(join(root, '视频'), '.mp4')).toBe(join(root, '视频.mp4'))
  })
})

describe('sanitize', () => {
  it('从共享模块转出', () => {
    expect(sanitize('a/b:c')).toBe('a／b：c')
  })
})
