import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '@shared/options'
import type { EnqueueRequest, MediaItem } from '@shared/types'
import type { DownloadManager } from './download/manager'

const h = vi.hoisted(() => ({ expandLazy: vi.fn(), send: vi.fn() }))
vi.mock('./bili/lists', () => ({ expandLazy: h.expandLazy }))
vi.mock('./windows', () => ({ send: h.send }))
const { makeEnqueue } = await import('./enqueue')

const item = (key: string, extra: Partial<MediaItem> = {}): MediaItem => ({ key, kind: 'ugc', title: key, index: 1, cid: 1, ...extra })
const REQ: EnqueueRequest = { title: '收藏夹', cover: '', kind: 'ugc', items: [item('a', { lazy: true })], options: normalizeOptions({}, 80) }
const manager = { enqueue: vi.fn() }
const enqueue = makeEnqueue(manager as unknown as DownloadManager)

beforeEach(() => {
  vi.clearAllMocks()
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

  it('展开失败时不加入队列', async () => {
    h.expandLazy.mockRejectedValue(new Error('网络请求失败'))
    await expect(enqueue(REQ)).rejects.toThrow('网络请求失败')
    expect(manager.enqueue).not.toHaveBeenCalled()
  })
})
