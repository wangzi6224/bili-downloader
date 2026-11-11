import { t } from '@shared/i18n'
import type { EnqueueRequest, MediaItem } from '@shared/types'
import { expandLazy } from './bili/lists'
import type { DownloadManager } from './download/manager'
import { send } from './windows'

export async function prepareEnqueueItems(items: MediaItem[]): Promise<{ items: MediaItem[]; failed: MediaItem[]; note?: string }> {
  const expanded = await expandLazy(items, (done, total) =>
    send('parse:progress', { done, total, title: t('misc.fetchingParts') })
  )
  const failed = expanded.filter((i) => i.unavailable)
  return {
    items: expanded.filter((i) => !i.unavailable),
    failed,
    note: failed.length ? t('misc.partsUnavailable', { count: failed.length, reason: failed[0].unavailable! }) : undefined
  }
}

/**
 * 加入下载队列的统一入口（界面、订阅、MCP 共用）：
 * 列表里的视频先查出分P，失效的跳过并返回提示。
 */
export function makeEnqueue(manager: DownloadManager) {
  return async (req: EnqueueRequest, beforeQueue?: () => void): Promise<string | undefined> => {
    const { items, note } = await prepareEnqueueItems(req.items)
    beforeQueue?.()
    manager.enqueue({ ...req, items })
    return note
  }
}
