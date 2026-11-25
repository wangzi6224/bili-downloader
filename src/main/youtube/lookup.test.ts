import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fetchComments, fetchTranscript, parseVtt, search, searchParams, searchUrl } from './lookup'

const fixture = (name: string): string => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

/** 假的 service：exec 返回给定的 stdout，记下参数 */
const fakeSvc = (stdout: string | ((args: string[]) => Promise<string> | string)) => {
  const exec = vi.fn(async (args: string[], _o?: unknown) => ({ stdout: typeof stdout === 'string' ? stdout : await stdout(args), stderr: '' }))
  return { exec }
}

describe('searchParams', () => {
  it('只按频道筛和按上传日期排与 YouTube 页面上的值一致', () => {
    expect(searchParams({ type: 'channel' })).toBe('EgIQAg==')
    expect(searchParams({ sort: 'date' })).toBe('CAI=')
  })

  it('相关度排序不编码，什么都没有时返回空', () => {
    expect(searchParams({ sort: 'relevance' })).toBeUndefined()
    expect(searchParams({})).toBeUndefined()
  })

  it('排序和多个筛选组合在一起', () => {
    const sp = searchParams({ sort: 'views', uploadDate: 'week', type: 'video', duration: 'long' })!
    expect([...Buffer.from(sp, 'base64')]).toEqual([0x08, 3, 0x12, 6, 0x08, 3, 0x10, 1, 0x18, 2])
    expect([...Buffer.from(searchParams({ sort: 'rating', duration: 'medium', uploadDate: 'hour' })!, 'base64')]).toEqual([0x08, 1, 0x12, 4, 0x08, 1, 0x18, 3])
    expect([...Buffer.from(searchParams({ uploadDate: 'today', type: 'playlist', duration: 'short' })!, 'base64')]).toEqual([0x12, 6, 0x08, 2, 0x10, 3, 0x18, 1])
    expect([...Buffer.from(searchParams({ uploadDate: 'month' })!, 'base64')]).toEqual([0x12, 2, 0x08, 4])
    expect([...Buffer.from(searchParams({ uploadDate: 'year' })!, 'base64')]).toEqual([0x12, 2, 0x08, 5])
  })
})

describe('searchUrl', () => {
  it('查询词和 sp 都做 URL 编码', () => {
    expect(searchUrl('a b&c', { type: 'channel' })).toBe('https://www.youtube.com/results?search_query=a%20b%26c&sp=EgIQAg%3D%3D')
  })

  it('没有 sp 时不带这个参数', () => {
    expect(searchUrl('猫', {})).toBe(`https://www.youtube.com/results?search_query=${encodeURIComponent('猫')}`)
  })
})

describe('search', () => {
  it('按条数取结果页，解析最后一行 JSON', async () => {
    const svc = fakeSvc(`[debug] 前面的行\n${fixture('search.json').replace(/\n/g, '')}\n`)
    const entries = await search(svc, 'lofi', { limit: 3, type: 'video' }, { account: null })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].id).toBe('rFZHOHl-L8A')
    expect(svc.exec).toHaveBeenCalledWith(['--flat-playlist', '-J', '--playlist-items', '1:3', searchUrl('lofi', { limit: 3, type: 'video' } as never)], { account: null })
  })

  it('没有 entries 时返回空列表，exec 选项缺省为空对象', async () => {
    const svc = fakeSvc(JSON.stringify({ id: 'x' }))
    expect(await search(svc, 'x', { limit: 1 })).toEqual([])
    expect(svc.exec.mock.calls[0][1]).toEqual({})
  })
})

describe('fetchComments', () => {
  it('extractor-args 里是总数、顶层条数、回复总数、每条回复数', async () => {
    const svc = fakeSvc(JSON.stringify({ comments: [{ id: 'c1', parent: 'root', text: 'hi' }], comment_count: 42 }))
    const r = await fetchComments(svc, 'https://www.youtube.com/watch?v=abc', { sort: 'new', count: 50, replies: 3 })
    expect(r).toEqual({ comments: [{ id: 'c1', parent: 'root', text: 'hi' }], total: 42 })
    expect(svc.exec).toHaveBeenCalledWith(
      ['--skip-download', '--write-comments', '-J', '--no-playlist', '--extractor-args', 'youtube:max_comments=200,50,150,3;comment_sort=new', 'https://www.youtube.com/watch?v=abc'],
      {}
    )
  })

  it('没有评论和总数时给空列表和 undefined', async () => {
    const svc = fakeSvc(`警告\n${JSON.stringify({ comment_count: null })}`)
    expect(await fetchComments(svc, 'u', { sort: 'top', count: 10, replies: 0 }, { account: 'a' })).toEqual({ comments: [], total: undefined })
    expect(svc.exec.mock.calls[0][0]).toContain('youtube:max_comments=10,10,0,0;comment_sort=top')
  })
})

describe('parseVtt', () => {
  it('解析带小时和不带小时的时间，去掉样式标签和 HTML 实体', () => {
    const vtt = [
      'WEBVTT',
      'Kind: captions',
      '',
      '00:00:01.500 --> 00:00:03.000 align:start position:0%',
      '<c>你好</c>&nbsp;<00:00:02.000><c>世界</c>',
      '',
      '1',
      '01:02.250 --> 01:04.000',
      'a &amp; b &lt;c&gt;',
      '',
      '1:00:00,000 --> 1:00:01,000',
      'late'
    ].join('\r\n')
    expect(parseVtt(vtt)).toEqual([
      { from: 1.5, to: 3, text: '你好 世界' },
      { from: 62.25, to: 64, text: 'a & b <c>' },
      { from: 3600, to: 3601, text: 'late' }
    ])
  })

  it('一条里的多行合成一行；和上一条重复的行去掉，整条重复时只延长上一条', () => {
    const vtt = [
      'WEBVTT',
      '',
      'NOTE 这是注释',
      '',
      '00:00.000 --> 00:00.500',
      '<c> </c>',
      '',
      '00:00.500 --> 00:02.000',
      'one',
      '   ',
      'two',
      '',
      '00:02.000 --> 00:04.000',
      'two',
      'three',
      '',
      '00:04.000 --> 00:05.000',
      'three',
      '',
      '00:05.000 --> 00:06.000',
      'one'
    ].join('\n')
    expect(parseVtt(vtt)).toEqual([
      { from: 0.5, to: 2, text: 'one two' },
      { from: 2, to: 5, text: 'three' },
      { from: 5, to: 6, text: 'one' }
    ])
  })
})

describe('fetchTranscript', () => {
  it('人工字幕用 --write-subs，读到 .vtt 后解析，临时目录会删掉', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yt-sub-test-'))
    const svc = fakeSvc(async (args) => {
      const out = args[args.indexOf('-P') + 1]
      await writeFile(join(out, 'sub.en.vtt'), 'WEBVTT\n\n00:01.000 --> 00:02.000\nhello\n')
      await writeFile(join(out, 'other.txt'), 'x')
      return ''
    })
    const lines = await fetchTranscript(svc, 'https://www.youtube.com/watch?v=abc', 'en', false, { account: 'a' }, async () => dir)
    expect(lines).toEqual([{ from: 1, to: 2, text: 'hello' }])
    const args = svc.exec.mock.calls[0][0]
    expect(args).toContain('--write-subs')
    expect(args).not.toContain('--write-auto-subs')
    expect(args.slice(args.indexOf('--sub-langs'), args.indexOf('--sub-langs') + 2)).toEqual(['--sub-langs', 'en'])
    expect(svc.exec.mock.calls[0][1]).toEqual({ account: 'a' })
    expect(existsSync(dir)).toBe(false)
  })

  it('自动字幕用 --write-auto-subs，没有字幕文件时返回 undefined', async () => {
    const svc = fakeSvc('')
    let dir = ''
    const lines = await fetchTranscript(svc, 'u', 'en-orig', true, undefined, async () => {
      dir = await mkdtemp(join(tmpdir(), 'yt-sub-test-'))
      return dir
    })
    expect(lines).toBeUndefined()
    expect(svc.exec.mock.calls[0][0]).toContain('--write-auto-subs')
    expect(existsSync(dir)).toBe(false)
  })

  it('下载失败时也删掉临时目录；缺省在系统临时目录下建目录', async () => {
    let dir = ''
    const svc = fakeSvc(async (args) => {
      dir = args[args.indexOf('-P') + 1]
      await mkdir(join(dir, 'sub'), { recursive: true })
      throw new Error('boom')
    })
    await expect(fetchTranscript(svc, 'u', 'en', false)).rejects.toThrow('boom')
    expect(dir.startsWith(join(tmpdir(), 'yt-sub-'))).toBe(true)
    expect(existsSync(dir)).toBe(false)
  })
})
