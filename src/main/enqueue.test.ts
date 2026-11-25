import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem } from '@shared/types'
import type { DownloadManager } from './download/manager'
import { inAuthScope, PARTITION } from './auth/scope'

const h = vi.hoisted(() => ({ expandLazy: vi.fn(), send: vi.fn(), ytExpand: vi.fn(), youtube: vi.fn() }))
vi.mock('./bili/lists', () => ({ expandLazy: h.expandLazy }))
vi.mock('./youtube/service', () => ({ youtube: h.youtube }))
vi.mock('./windows', () => ({ send: h.send }))
const { makeEnqueue } = await import('./enqueue')

const item = (key: string, extra: Partial<MediaItem> = {}): MediaItem => ({ key, kind: 'ugc', title: key, index: 1, cid: 1, ...extra })
const REQ: EnqueueRequest = { title: '收藏夹', cover: '', kind: 'ugc', items: [item('a', { lazy: true })], options: normalizeOptions({}, 80) }
const manager = { enqueue: vi.fn() }
const enqueue = makeEnqueue(manager as unknown as DownloadManager)

beforeEach(() => {
  vi.clearAllMocks()
  h.youtube.mockReturnValue({ expand: h.ytExpand })
})

describe('makeEnqueue', () => {
  it('展开分P后整体加入队列，没有失效的不返回提示', async () => {
    const expanded = [item('ugc:BV1:1'), item('ugc:BV1:2')]
    h.expandLazy.mockResolvedValue(expanded)
    expect(await enqueue(REQ)).toBeUndefined()
    expect(h.expandLazy).toHaveBeenCalledWith(REQ.items, expect.any(Function))
    expect(manager.enqueue).toHaveBeenCalledWith({ ...REQ, items: expanded })
  })

  it('跳过失效的视频，提示个数和第一个原因', async () => {
    h.expandLazy.mockResolvedValue([item('ok'), item('x', { unavailable: '视频不见了' }), item('y', { unavailable: '无权限' })])
    expect(await enqueue(REQ)).toBe('2 个视频无法获取（视频不见了）')
    expect(manager.enqueue.mock.calls[0][0].items.map((i: MediaItem) => i.key)).toEqual(['ok'])
  })

  it('全部失效时也照常调用，只是没有条目', async () => {
    h.expandLazy.mockResolvedValue([item('x', { unavailable: '已失效' })])
    expect(await enqueue(REQ)).toBe('1 个视频无法获取（已失效）')
    expect(manager.enqueue.mock.calls[0][0].items).toEqual([])
  })

  it('展开进度推送给界面', async () => {
    h.expandLazy.mockImplementation(async (items: MediaItem[], onProgress: (done: number, total: number) => void) => {
      onProgress(1, 3)
      return items
    })
    await enqueue(REQ)
    expect(h.send).toHaveBeenCalledWith('parse:progress', { done: 1, total: 3, title: '正在获取视频分P' })
  })

  it('后台（订阅检查等）展开时不推送进度', async () => {
    h.expandLazy.mockImplementation(async (items: MediaItem[], onProgress: (done: number, total: number) => void) => {
      onProgress(1, 3)
      return items
    })
    await inAuthScope({ partition: PARTITION, background: true }, () => enqueue(REQ))
    expect(h.send).not.toHaveBeenCalled()
    expect(manager.enqueue).toHaveBeenCalled()
  })

  it('展开失败时不加入队列', async () => {
    h.expandLazy.mockRejectedValue(new Error('网络请求失败'))
    await expect(enqueue(REQ)).rejects.toThrow('网络请求失败')
    expect(manager.enqueue).not.toHaveBeenCalled()
  })

  it('展开后、真正入队前重新验证账号', async () => {
    h.expandLazy.mockResolvedValue([item('ugc:BV1:1')])
    await expect(enqueue(REQ, () => { throw new Error('账号已切换') })).rejects.toThrow('账号已切换')
    expect(manager.enqueue).not.toHaveBeenCalled()
  })
})

describe('YouTube 懒加载项', () => {
  const yt = (key: string, extra: Partial<MediaItem> = {}): MediaItem => ({ key, kind: 'youtube', title: key, index: 1, cid: 0, ...extra })
  const YT_REQ: EnqueueRequest = {
    title: '频道',
    cover: '',
    kind: 'youtube',
    items: [yt('ytpl:PL1', { lazy: true }), yt('yt:v1', { ytId: 'v1' })],
    options: normalizeOptions({})
  }

  it('先用 YouTube 服务展开（带上请求的账号），再交给 expandLazy', async () => {
    const videos = [yt('yt:a', { ytId: 'a' }), yt('yt:b', { ytId: 'b' }), yt('yt:v1', { ytId: 'v1' })]
    h.ytExpand.mockResolvedValue(videos)
    h.expandLazy.mockImplementation(async (items: MediaItem[]) => items)
    expect(await enqueue({ ...YT_REQ, ytAccount: 'acc-1' })).toBeUndefined()
    expect(h.ytExpand).toHaveBeenCalledWith(YT_REQ.items, { account: 'acc-1' })
    expect(h.expandLazy).toHaveBeenCalledWith(videos, expect.any(Function))
    expect(manager.enqueue).toHaveBeenCalledWith({ ...YT_REQ, ytAccount: 'acc-1', items: videos })
  })

  it('请求没带账号时不登录（account 为 null）', async () => {
    h.ytExpand.mockResolvedValue([])
    h.expandLazy.mockResolvedValue([])
    await enqueue(YT_REQ)
    expect(h.ytExpand).toHaveBeenCalledWith(YT_REQ.items, { account: null })
  })

  it('展开失败的播放列表算作无法获取，其余照常加入', async () => {
    h.ytExpand.mockResolvedValue([yt('ytpl:PL1', { unavailable: '播放列表不存在' }), yt('yt:v1', { ytId: 'v1' })])
    h.expandLazy.mockImplementation(async (items: MediaItem[]) => items)
    expect(await enqueue(YT_REQ)).toBe('1 个视频无法获取（播放列表不存在）')
    expect(manager.enqueue.mock.calls[0][0].items.map((i: MediaItem) => i.key)).toEqual(['yt:v1'])
  })

  it('没有 YouTube 懒加载项时不用 YouTube 服务（B站懒加载项、非懒加载的 YouTube 项）', async () => {
    h.expandLazy.mockImplementation(async (items: MediaItem[]) => items)
    await enqueue({ ...REQ, items: [item('a', { lazy: true }), yt('yt:v1', { ytId: 'v1' })] })
    expect(h.youtube).not.toHaveBeenCalled()
    expect(h.ytExpand).not.toHaveBeenCalled()
  })

  it('YouTube 展开中止或出错时不加入队列', async () => {
    h.ytExpand.mockRejectedValue(new Error('已取消'))
    await expect(enqueue(YT_REQ)).rejects.toThrow('已取消')
    expect(h.expandLazy).not.toHaveBeenCalled()
    expect(manager.enqueue).not.toHaveBeenCalled()
  })
})
