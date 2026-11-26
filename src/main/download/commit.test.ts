import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commitFiles } from './commit'
import { AbortError, DiskError } from './errors'

let root = ''
beforeEach(() => (root = mkdtempSync(join(tmpdir(), 'commit-'))))
afterEach(() => rmSync(root, { recursive: true, force: true }))

const source = (name: string) => {
  const path = join(root, name)
  writeFileSync(path, name)
  return { path, name }
}
const run = (files: { path: string; name: string }[], signal = new AbortController().signal) =>
  commitFiles(files, join(root, 'out'), join(root, 'out.tmp'), signal)

describe('commitFiles', () => {
  it('复制到暂存目录后整个改名，返回成品路径', async () => {
    const paths = await run([source('01.jpg'), source('music.mp3')])
    expect(paths).toEqual([join(root, 'out', '01.jpg'), join(root, 'out', 'music.mp3')])
    expect(existsSync(join(root, 'out.tmp'))).toBe(false)
    expect(readdirSync(join(root, 'out'))).toEqual(['01.jpg', 'music.mp3'])
  })

  it('文件名只取最后一段，不能写到目录外面', async () => {
    const file = source('a.jpg')
    expect(await run([{ ...file, name: '../../escape.jpg' }])).toEqual([join(root, 'out', 'escape.jpg')])
  })

  it('开始前或复制途中取消时抛 AbortError，成品目录不出现', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(run([source('01.jpg')], ac.signal)).rejects.toBeInstanceOf(AbortError)
    const later = { aborted: false } as AbortSignal
    const check = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
    Object.defineProperty(later, 'aborted', { get: check })
    await expect(run([source('02.jpg')], later)).rejects.toBeInstanceOf(AbortError)
    expect(existsSync(join(root, 'out'))).toBe(false)
  })

  it('复制失败时报磁盘错误', async () => {
    await expect(run([{ path: join(root, 'none'), name: 'x' }])).rejects.toBeInstanceOf(DiskError)
  })
})
