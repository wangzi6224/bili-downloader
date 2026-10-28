import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioPref } from '@shared/types'

type Params = Record<string, unknown>
const api = vi.hoisted(() => vi.fn<(url: string, params?: Params, opts?: { wbi?: boolean }) => Promise<unknown>>())

vi.mock('electron', () => ({}))
vi.mock('./http', async (orig) => ({ ...(await orig<typeof import('./http')>()), api }))

const { UnsupportedError } = await import('./http')
const { parseAudio, parseAudioMenu, getAudioStream, AUDIO_STREAM_INFO } = await import('./audio')

const BASE = 'https://www.bilibili.com/audio/music-service-c/web'

const song = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: `歌 ${id}`,
  cover: `${id}.jpg`,
  uname: '歌手',
  uid: 8,
  duration: 180,
  intro: `介绍 ${id}`,
  ...extra
})

beforeEach(() => {
  api.mockReset()
})

describe('parseAudio', () => {
  it.each([
    ['毫秒', 1_700_000_000_123, 1_700_000_000],
    ['秒', 1_700_000_000, 1_700_000_000],
    ['缺失', undefined, undefined]
  ])('passtime 为%s时换算成秒', async (_, passtime, pubdate) => {
    api.mockResolvedValue(song(5, { passtime }))
    const r = await parseAudio(5)
    expect(r.groups[0].items[0].pubdate).toBe(pubdate)
    expect(r.meta?.pubdate).toBe(pubdate)
  })

  it('单曲生成一个条目并默认选中', async () => {
    api.mockResolvedValue(song(5))
    const r = await parseAudio(5)
    expect(api).toHaveBeenCalledWith(`${BASE}/song/info`, { sid: 5 })
    expect(r).toMatchObject({
      kind: 'audio',
      title: '歌 5',
      cover: '5.jpg',
      owner: '歌手',
      meta: { owner: '歌手', ownerMid: 8, desc: '介绍 5', url: 'https://www.bilibili.com/audio/au5' },
      defaultSelected: ['audio:5']
    })
    expect(r.groups[0]).toEqual({
      id: 'audio',
      title: '歌 5',
      items: [
        { key: 'audio:5', kind: 'audio', title: '歌 5', index: 1, cid: 5, cover: '5.jpg', duration: 180, pubdate: undefined, desc: '介绍 5', owner: '歌手', ownerMid: 8 }
      ]
    })
  })
})

describe('parseAudioMenu', () => {
  it('同时取歌单信息和第一页，再按页码顺序取完剩余页', async () => {
    api.mockImplementation(async (url, params = {}) => {
      if (url === `${BASE}/menu/info`) return { title: '歌单名', cover: 'menu.jpg', intro: '歌单介绍', uname: '创建者', uid: 4 }
      const pn = params.pn as number
      return { pageCount: 3, totalSize: 5, data: pn === 3 ? [song(5)] : [song(pn * 2 - 1), song(pn * 2)] }
    })
    const r = await parseAudioMenu(77)
    expect(api.mock.calls.slice(0, 2)).toEqual([
      [`${BASE}/menu/info`, { sid: 77 }],
      [`${BASE}/song/of-menu`, { sid: 77, pn: 1, ps: 100 }]
    ])
    expect(api.mock.calls.slice(2).map(([, p]) => p?.pn)).toEqual([2, 3])
    const items = r.groups[0].items
    expect(items.map((i) => [i.key, i.index])).toEqual([1, 2, 3, 4, 5].map((id) => [`audio:${id}`, id]))
    expect(r).toMatchObject({
      kind: 'audio',
      title: '歌单名',
      cover: 'menu.jpg',
      owner: '创建者',
      meta: { owner: '创建者', ownerMid: 4, desc: '歌单介绍', url: 'https://www.bilibili.com/audio/am77' },
      defaultSelected: items.map((i) => i.key)
    })
    expect(r.groups[0]).toMatchObject({ id: 'menu', title: '歌单' })
  })

  it('只有一页时不再翻页', async () => {
    api.mockImplementation(async (url) => (url.endsWith('/menu/info') ? { title: 't', cover: '' } : { pageCount: 1, totalSize: 1, data: [song(1)] }))
    const r = await parseAudioMenu(1)
    expect(api).toHaveBeenCalledTimes(2)
    expect(r.groups[0].items).toHaveLength(1)
  })
})

describe('getAudioStream', () => {
  const qualities = () => api.mock.calls.map(([, p]) => p?.quality)

  it.each<[AudioPref, number[]]>([
    ['best', [3, 2, 1, 0]],
    ['flac', [3, 2, 1, 0]],
    ['dolby', [2, 1, 0]],
    ['192k', [1, 0]],
    ['132k', [0]],
    ['64k', [0]]
  ])('%s 依次尝试音质 %j，全部失败时抛 UnsupportedError', async (pref, order) => {
    api.mockImplementation(async (_, p = {}) => {
      throw new Error(`音质 ${p.quality} 失败`)
    })
    const err = await getAudioStream(9, pref).catch((e: unknown) => e)
    expect(qualities()).toEqual(order)
    expect(api).toHaveBeenCalledWith(`${BASE}/url`, { sid: 9, privilege: 2, quality: order[0] })
    expect(err).toBeInstanceOf(UnsupportedError)
    expect((err as Error).message).toBe('拿不到这首歌的下载地址：音质 0 失败')
  })

  it('cdns 为空时跳过当前音质，返回第一个可用的', async () => {
    api.mockImplementation(async (_, p = {}) => {
      if (p.quality === 3) return { cdns: null, size: 0, type: 3 }
      if (p.quality === 2) return { cdns: [], size: 0, type: 2 }
      return { cdns: ['https://cdn/a.m4a', 'https://cdn2/a.m4a'], size: 1234, type: 1 }
    })
    expect(await getAudioStream(9, 'best')).toEqual({
      urls: ['https://cdn/a.m4a', 'https://cdn2/a.m4a'],
      size: 1234,
      label: '192K',
      flac: false
    })
    expect(qualities()).toEqual([3, 2, 1])
  })

  it.each([
    ['https://cdn/a.flac?deadline=1', true],
    ['https://cdn/A.FLAC', true],
    ['https://cdn/a.flac.m4a', false]
  ])('按第一个地址识别无损：%s → %s', async (url, flac) => {
    api.mockResolvedValue({ cdns: [url], size: 1, type: 3 })
    const r = await getAudioStream(9, 'flac')
    expect(r.flac).toBe(flac)
    expect(r.label).toBe('无损')
  })

  it('type 不认识时用请求的音质作标签', async () => {
    api.mockResolvedValue({ cdns: ['https://cdn/a.m4a'], size: 1, type: 99 })
    expect((await getAudioStream(9, '64k')).label).toBe('128K')
  })

  it('全部没有地址时报错不带原因，非 Error 的异常转成字符串', async () => {
    api.mockResolvedValue({ cdns: null, size: 0, type: 0 })
    await expect(getAudioStream(9, '192k')).rejects.toThrow(/^拿不到这首歌的下载地址$/)

    api.mockRejectedValue('字符串错误')
    await expect(getAudioStream(9, '64k')).rejects.toThrow('拿不到这首歌的下载地址：字符串错误')
  })

  it('音频的可选音质', () => {
    expect(AUDIO_STREAM_INFO.hasAudio).toBe(true)
    expect(AUDIO_STREAM_INFO.audios.filter((a) => a.available).map((a) => a.id)).toEqual(['best', 'flac', '192k', '64k'])
  })
})
