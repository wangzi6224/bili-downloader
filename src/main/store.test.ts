import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readJson, readJsonArray, writeJson } from './store'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'store-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readJson / writeJson', () => {
  it('写入后能原样读回，自动创建上级目录，按两格缩进排版', () => {
    const file = join(dir, 'a', 'b', 'x.json')
    writeJson(file, { n: 1, list: ['中文'] })
    expect(readJson(file)).toEqual({ n: 1, list: ['中文'] })
    expect(readFileSync(file, 'utf8')).toBe('{\n  "n": 1,\n  "list": [\n    "中文"\n  ]\n}')
  })

  it('覆盖已有文件，不留下临时文件', () => {
    const file = join(dir, 'x.json')
    writeJson(file, [1])
    writeJson(file, [2])
    expect(readJson(file)).toEqual([2])
    expect(readdirSync(dir)).toEqual(['x.json'])
  })

  it('文件不存在或内容损坏时返回 undefined', () => {
    expect(readJson(join(dir, 'nope.json'))).toBeUndefined()
    writeFileSync(join(dir, 'bad.json'), '{oops')
    expect(readJson(join(dir, 'bad.json'))).toBeUndefined()
  })
})

describe('readJsonArray', () => {
  it('是数组就原样返回，不存在、损坏或不是数组都当作空列表', () => {
    const file = join(dir, 'list.json')
    writeJson(file, [{ id: 1 }])
    expect(readJsonArray(file)).toEqual([{ id: 1 }])
    expect(readJsonArray(join(dir, 'nope.json'))).toEqual([])
    for (const content of ['{oops', '{}', 'null', '"text"']) {
      writeFileSync(file, content)
      expect(readJsonArray(file)).toEqual([])
    }
  })
})
