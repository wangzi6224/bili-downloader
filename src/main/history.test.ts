import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry, ParseRecord } from '@shared/types'

const h = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => h.userData } }))

let history: typeof import('./history')

beforeEach(async () => {
  h.userData = mkdtempSync(join(tmpdir(), 'history-'))
  // 缓存在模块里，每个用例重新加载
  vi.resetModules()
  history = await import('./history')
})
afterEach(() => {
  rmSync(h.userData, { recursive: true, force: true })
})

const saved = (name: string): unknown => JSON.parse(readFileSync(join(h.userData, name), 'utf8'))
const entry = (key: string, at = 1): HistoryEntry => ({ key, title: key, groupTitle: '', path: `/dl/${key}.mp4`, at })
const parse = (input: string, at = 1): ParseRecord => ({ input, title: input, kind: 'ugc', cover: '', count: 1, at })

describe('下载历史', () => {
  it('按 key 记录，同一个 key 以最新一次为准，并写入文件', () => {
    history.recordDownload(entry('a', 1))
    history.recordDownload(entry('b', 2))
    history.recordDownload(entry('a', 3))
    expect(history.downloadedKeys()).toEqual(['a', 'b'])
    expect(saved('downloads.json')).toEqual([entry('a', 3), entry('b', 2)])
  })

  it('删除和清空', () => {
    history.recordDownload(entry('a'))
    history.recordDownload(entry('b'))
    history.removeDownloads([entry('a'), entry('nope')])
    expect(history.downloadedKeys()).toEqual(['b'])
    history.clearDownloads()
    expect(history.downloadedKeys()).toEqual([])
    expect(saved('downloads.json')).toEqual([])
  })

  it('在写入、删除和清空后通知明细重新读取下载记录', () => {
    const snapshots: string[][] = []
    const off = history.onDownloadsChanged(() => snapshots.push(history.downloadedKeys()))
    history.recordDownload(entry('pgc:1'))
    history.recordDownload(entry('pgc:2'))
    history.removeDownloads([entry('pgc:1')])
    history.clearDownloads()
    off()
    history.recordDownload(entry('pgc:3'))
    expect(snapshots).toEqual([['pgc:1'], ['pgc:1', 'pgc:2'], ['pgc:2'], []])
  })

  it('第一次用到时读取已有的文件，坏文件当作空', () => {
    writeFileSync(join(h.userData, 'downloads.json'), JSON.stringify([entry('old')]))
    expect(history.downloadedKeys()).toEqual(['old'])
    writeFileSync(join(h.userData, 'parses.json'), '{oops')
    expect(history.parseRecords()).toEqual([])
  })

  it('同一视频的文件分别记录账号，删除其中一份只移除对应文件', () => {
    const a = { ...entry('a'), accountMid: 1 }
    const b = { ...entry('a', 2), accountMid: 2, path: '/dl/a (2).mp4' }
    history.recordDownload(a)
    history.recordDownload(b)
    expect(history.downloadRecords()).toEqual([a, b])
    expect(history.downloadedKeys()).toEqual(['a'])
    expect(history.downloadedKeys(2)).toEqual(['a'])
    history.removeDownloads([b])
    expect(history.downloadRecords()).toEqual([a])
    expect(history.downloadedKeys(2)).toEqual([])
  })

  it('文件内容不是数组时当作空，不会崩溃（回归）', () => {
    writeFileSync(join(h.userData, 'downloads.json'), '{}')
    writeFileSync(join(h.userData, 'parses.json'), '{"input": "x"}')
    expect(history.downloadedKeys()).toEqual([])
    expect(history.parseRecords()).toEqual([])
    history.recordParse(parse('y'))
    expect(saved('parses.json')).toEqual([parse('y')])
  })
})

describe('解析记录', () => {
  it('同一个链接只保留最新一条，放到最前面', () => {
    history.recordParse(parse('x', 1))
    history.recordParse(parse('y', 2))
    history.recordParse(parse('x', 3))
    expect(history.parseRecords()).toEqual([parse('x', 3), parse('y', 2)])
    expect(saved('parses.json')).toEqual([parse('x', 3), parse('y', 2)])
  })

  it('同一个链接保留各账号的记录，按账号删除不影响其他记录', () => {
    const a = { ...parse('x', 1), accountMid: 11 }
    const b = { ...parse('x', 2), accountMid: 22 }
    const legacy = parse('x', 0)
    history.recordParse(legacy)
    history.recordParse(a)
    history.recordParse(b)
    history.recordParse({ ...a, at: 3 })
    expect(history.parseRecords()).toEqual([{ ...a, at: 3 }, b, legacy])
    expect(history.removeParse('x', 11)).toEqual([b, legacy])
    expect(history.removeParse('x', null)).toEqual([b])
    expect(saved('parses.json')).toEqual([b])
  })

  it('最多 300 条，超出时丢掉最旧的', () => {
    for (let i = 0; i < 302; i++) history.recordParse(parse(`u${i}`, i))
    const list = history.parseRecords()
    expect(list).toHaveLength(300)
    expect(list[0].input).toBe('u301')
    expect(list.at(-1)!.input).toBe('u2')
  })

  it('删除一条返回剩下的，清空后文件也是空的', () => {
    history.recordParse(parse('x'))
    history.recordParse(parse('y'))
    expect(history.removeParse('x').map((p) => p.input)).toEqual(['y'])
    expect(history.removeParse('nope').map((p) => p.input)).toEqual(['y'])
    history.clearParses()
    expect(history.parseRecords()).toEqual([])
    expect(saved('parses.json')).toEqual([])
  })
})
