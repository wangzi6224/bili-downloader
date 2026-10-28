import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isInside, pruneDirs, removeTaskOutputs, sidecarFiles } from './cleanup'

let root = ''
const touch = (...names: string[]): void => {
  for (const n of names) {
    mkdirSync(join(root, n, '..'), { recursive: true })
    writeFileSync(join(root, n), '')
  }
}
const ls = (dir = ''): string[] => readdirSync(join(root, dir)).sort()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cleanup-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('isInside', () => {
  it('只认 root 里面的路径', () => {
    expect(isInside('/a/b', '/a/b/c.mp4')).toBe(true)
    expect(isInside('/a/b', '/a/b/..foo')).toBe(true)
    expect(isInside('/a/b', '/a/b')).toBe(false)
    expect(isInside('/a/b', '/a/bc/d.mp4')).toBe(false)
    expect(isInside('/a/b', '/a/b/../c.mp4')).toBe(false)
  })
})

describe('sidecarFiles', () => {
  it('只匹配同名的附加文件', () => {
    touch(
      'foo.mp4',
      'foo.jpg',
      'foo.nfo',
      'foo-poster.png',
      'foo.zh-CN.srt',
      'foo.ai-zh.srt',
      'foo.danmaku.ass',
      'foo.danmaku.xml',
      'foo (1).mp4',
      'foo (1).jpg',
      'foo.bar.zh.srt',
      'foobar.jpg',
      'tvshow.nfo',
      'poster.jpg'
    )
    const names = sidecarFiles(join(root, 'foo.mp4')).map((p) => p.slice(root.length + 1)).sort()
    expect(names).toEqual(['foo-poster.png', 'foo.ai-zh.srt', 'foo.danmaku.ass', 'foo.danmaku.xml', 'foo.jpg', 'foo.nfo', 'foo.zh-CN.srt'])
  })

  it('目录不存在时返回空', () => {
    expect(sidecarFiles(join(root, 'nope', 'foo.mp4'))).toEqual([])
  })
})

describe('pruneDirs', () => {
  it('只剩共用文件时连目录删掉，逐级向上但不删 root', () => {
    touch('show/S1/tvshow.nfo', 'show/S1/poster.jpg', 'show/S1/.DS_Store')
    pruneDirs(join(root, 'show', 'S1'), root)
    expect(existsSync(root)).toBe(true)
    expect(ls()).toEqual([])
  })

  it('还有别的文件就保留', () => {
    touch('show/ep2.mp4', 'show/tvshow.nfo')
    pruneDirs(join(root, 'show'), root)
    expect(ls('show')).toEqual(['ep2.mp4', 'tvshow.nfo'])
  })

  it('不越过 root', () => {
    pruneDirs(root, root)
    expect(existsSync(root)).toBe(true)
  })
})

describe('removeTaskOutputs', () => {
  it('删掉成品、附加文件和合并半成品，清理变空的目录', () => {
    touch('合集/01 foo.mp4', '合集/01 foo.jpg', '合集/01 foo.danmaku.ass', '合集/02 bar.mp4.tmp', '合集/tvshow.nfo')
    expect(removeTaskOutputs({ outputPath: join(root, '合集', '01 foo.mp4') }, root)).toEqual([])
    expect(ls('合集')).toEqual(['02 bar.mp4.tmp', 'tvshow.nfo'])
    removeTaskOutputs({ tmpOutput: join(root, '合集', '02 bar.mp4.tmp') }, root)
    expect(ls()).toEqual([])
  })

  it('不删下载目录外面的文件', () => {
    const outside = mkdtempSync(join(tmpdir(), 'cleanup-outside-'))
    writeFileSync(join(outside, 'x.mp4'), '')
    removeTaskOutputs({ outputPath: join(outside, 'x.mp4') }, root)
    expect(existsSync(join(outside, 'x.mp4'))).toBe(true)
    rmSync(outside, { recursive: true, force: true })
  })
})
