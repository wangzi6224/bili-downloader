import { describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '@shared/options'
import type { StreamInfo, UpdateInfo, UpdateState } from '@shared/types'
import {
  actualCodec,
  AUDIO_LABEL,
  classifyPaste,
  mcpClientConfig,
  moveUp,
  pingLabel,
  sortPings,
  summaryTags,
  updateEntry,
  updateHint,
  type EditableOptions
} from './viewLogic'

const none: EditableOptions = {
  ...DEFAULT_OPTIONS,
  cover: false,
  embedCover: false,
  subtitle: false,
  embedSubtitle: false,
  danmaku: false,
  chapters: false,
  nfo: false
}
const info = (hasAudio: boolean): StreamInfo => ({ qualities: [], audios: [], hasAudio })

describe('summaryTags', () => {
  it('完整视频：视频和音频', () => {
    expect(summaryTags(none)).toEqual(['视频（MP4）', '音频（最佳）'])
    expect(summaryTags({ ...none, container: 'mkv', audio: 'flac' })).toEqual(['视频（MKV）', '音频（Hi-Res 无损）'])
  })

  it('视频没有独立音轨时不显示音频', () => {
    expect(summaryTags(none, info(false))).toEqual(['视频（MP4）'])
    expect(summaryTags(none, info(true))).toEqual(['视频（MP4）', '音频（最佳）'])
    expect(summaryTags(none, null)).toEqual(['视频（MP4）', '音频（最佳）'])
  })

  it('仅视频标出无声', () => {
    expect(summaryTags({ ...none, output: 'video' })).toEqual(['视频（MP4）', '无声'])
  })

  it('仅音频不显示视频和只对视频有效的附加内容', () => {
    const all = { ...none, cover: true, subtitle: true, chapters: true, danmaku: true, nfo: true }
    expect(summaryTags({ ...all, output: 'audio', audio: '192k' })).toEqual(['音频（192K）', '封面', 'NFO'])
  })

  it('附加内容：封面、字幕任一方式都算，章节、弹幕、NFO', () => {
    expect(summaryTags({ ...none, embedCover: true, embedSubtitle: true })).toEqual(['视频（MP4）', '音频（最佳）', '封面', '字幕'])
    expect(summaryTags({ ...none, cover: true, subtitle: true, chapters: true, danmaku: true, nfo: true })).toEqual([
      '视频（MP4）',
      '音频（最佳）',
      '封面',
      '字幕',
      '章节',
      '弹幕',
      'NFO'
    ])
  })

  it('每种音质都有显示名', () => {
    expect(Object.keys(AUDIO_LABEL)).toEqual(['best', 'flac', 'dolby', '192k', '132k', '64k'])
  })
})

describe('moveUp', () => {
  it('和上一项交换，不修改原数组', () => {
    const order = ['avc', 'hevc', 'av1']
    expect(moveUp(order, 2)).toEqual(['avc', 'av1', 'hevc'])
    expect(moveUp(order, 1)).toEqual(['hevc', 'avc', 'av1'])
    expect(order).toEqual(['avc', 'hevc', 'av1'])
  })

  it('已经在最前面时返回 null', () => {
    expect(moveUp(['avc', 'hevc'], 0)).toBeNull()
  })
})

describe('actualCodec', () => {
  it('取优先级里第一个可用的', () => {
    expect(actualCodec(['avc', 'hevc', 'av1'], ['hevc', 'av1'])).toBe('hevc')
    expect(actualCodec(['av1', 'avc'], ['avc', 'av1'])).toBe('av1')
  })

  it('没有可用编码信息时为 undefined', () => {
    expect(actualCodec(['avc'], undefined)).toBeUndefined()
    expect(actualCodec(['avc'], [])).toBeUndefined()
  })

  it('没有交集时为 undefined', () => {
    expect(actualCodec(['avc'], ['av1'])).toBeUndefined()
  })
})

const update: UpdateInfo = { version: '1.2.0', date: '', notes: [], page: '', size: 0, skipped: false }
const state = (s: Record<string, unknown>): UpdateState => ({ current: '1.0.0', ...s }) as UpdateState

describe('updateHint', () => {
  it('还没拿到状态时为 null', () => {
    expect(updateHint(null)).toBeNull()
  })

  it('各状态的说明文字', () => {
    const text = (s: Record<string, unknown>): string | undefined => updateHint(state(s))?.text
    expect(text({ status: 'idle' })).toBe('还没有检查过')
    expect(text({ status: 'checking' })).toBe('正在检查…')
    expect(text({ status: 'latest' })).toBe('已是最新版本')
    expect(text({ status: 'available', info: update })).toBe('发现新版本 1.2.0')
    expect(text({ status: 'available', info: { ...update, skipped: true } })).toBe('发现新版本 1.2.0（已跳过）')
    expect(text({ status: 'downloading', info: update, done: 1, total: 2 })).toBe('正在下载 1.2.0')
    expect(text({ status: 'ready', info: update })).toBe('1.2.0 已下载，重启即可完成更新')
    expect(text({ status: 'installing', info: update })).toBe('正在安装…')
  })

  it('已是最新版本时带上检查时间', () => {
    const checkedAt = new Date(2026, 9, 28, 9, 5).getTime()
    expect(updateHint(state({ status: 'latest', checkedAt }))).toEqual({ text: '已是最新版本（09:05 检查）', error: false })
  })

  it('出错时返回错误信息并标记为错误', () => {
    expect(updateHint(state({ status: 'error', error: '网络不通' }))).toEqual({ text: '网络不通', error: true })
  })
})

describe('updateEntry', () => {
  it('没有新版本信息时不显示', () => {
    expect(updateEntry(null)).toBeNull()
    expect(updateEntry(state({ status: 'latest' }))).toBeNull()
    expect(updateEntry(state({ status: 'error', error: 'x' }))).toBeNull()
  })

  it('有新版本：已跳过的不显示', () => {
    expect(updateEntry(state({ status: 'available', info: update }))).toEqual({ icon: 'available', label: '新版本 1.2.0' })
    expect(updateEntry(state({ status: 'available', info: { ...update, skipped: true } }))).toBeNull()
  })

  it('下载中显示向下取整的百分比，不知道总大小时为 0%', () => {
    expect(updateEntry(state({ status: 'downloading', info: update, done: 2, total: 3 }))).toEqual({ icon: 'loading', label: '下载更新 66%' })
    expect(updateEntry(state({ status: 'downloading', info: update, done: 5, total: 0 }))?.label).toBe('下载更新 0%')
  })

  it('待重启、安装中、出错', () => {
    expect(updateEntry(state({ status: 'ready', info: update }))).toEqual({ icon: 'restart', label: '重启以完成更新' })
    expect(updateEntry(state({ status: 'installing', info: update }))).toEqual({ icon: 'loading', label: '正在安装更新…' })
    expect(updateEntry(state({ status: 'error', error: 'x', info: update }))).toEqual({ icon: 'error', label: '更新失败' })
  })
})

describe('mcpClientConfig', () => {
  it('生成本机地址、JSON 配置和 Claude Code 命令', () => {
    const c = mcpClientConfig(39231, 'tok')
    expect(c.endpoint).toBe('http://127.0.0.1:39231/mcp')
    expect(JSON.parse(c.json)).toEqual({
      mcpServers: { 'bili-downloader': { type: 'http', url: 'http://127.0.0.1:39231/mcp', headers: { Authorization: 'Bearer tok' } } }
    })
    expect(c.json.split('\n')[1]).toBe('  "mcpServers": {')
    expect(c.command).toBe('claude mcp add --transport http bili-downloader http://127.0.0.1:39231/mcp --header "Authorization: Bearer tok"')
  })
})

describe('CDN 测速', () => {
  it('pingLabel：null 是不通，其它显示毫秒', () => {
    expect(pingLabel(null)).toBe('不通')
    expect(pingLabel(35)).toBe('35 ms')
  })

  it('sortPings：按耗时从快到慢，不通和没结果的排最后', () => {
    const hosts = [
      { host: 'a', label: 'A' },
      { host: 'b', label: 'B' },
      { host: 'c', label: 'C' },
      { host: 'd', label: 'D' }
    ]
    const sorted = sortPings(hosts, { a: null, b: 80, c: 20 })
    expect(sorted.map((h) => [h.host, h.ms])).toEqual([
      ['c', 20],
      ['b', 80],
      ['a', null],
      ['d', undefined]
    ])
    expect(sorted[0].label).toBe('C')
  })
})

describe('classifyPaste', () => {
  const v1 = 'https://www.bilibili.com/video/BV1GJ411x7h7'
  const v2 = 'https://www.bilibili.com/video/BV1xx411c7mD'

  it('多个链接直接批量解析', () => {
    expect(classifyPaste(`${v1}\n${v2}`)).toEqual({ type: 'batch', inputs: [v1, v2] })
  })

  it('一个链接（或重复的同一个）立即解析', () => {
    expect(classifyPaste(v1)).toEqual({ type: 'single' })
    expect(classifyPaste(`${v1}\n${v1}`)).toEqual({ type: 'single' })
    expect(classifyPaste(`看看这个 ${v1} 不错`)).toEqual({ type: 'single' })
  })

  it('不是链接的照常粘贴', () => {
    expect(classifyPaste('随便一段文字')).toEqual({ type: 'none' })
    expect(classifyPaste('')).toEqual({ type: 'none' })
  })
})
