import { t } from '@shared/i18n'
import type { EnqueueRequest, MediaItem } from '@shared/types'
import { siteOf } from '@shared/site'
import { expandLazy } from './bili/lists'
import { youtube } from './youtube/service'
import { activeRevision, activeScope, authScope } from './auth/scope'
import type { DownloadManager } from './download/manager'
import { send } from './windows'

export async function prepareEnqueueItems(items: MediaItem[], ytAccount?: string): Promise<{ items: MediaItem[]; failed: MediaItem[]; note?: string }> {
  const revision = activeRevision()
  const scope = authScope()
  // YouTube 频道里的播放列表先展开成视频；剩下要展开的都是 B站的
  const ytExpanded = items.some((i) => i.lazy && siteOf(i) === 'youtube')
    ? await youtube().expand(items, { account: ytAccount ?? null })
    : items
  const expanded = await expandLazy(ytExpanded, (done, total) => {
    if (!scope.background && revision === activeRevision() && scope.partition === activeScope().partition) {
      send('parse:progress', { done, total, title: t('misc.fetchingParts') })
    }
  })
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
    const { items, note } = await prepareEnqueueItems(req.items, req.ytAccount)
    beforeQueue?.()
    manager.enqueue({ ...req, items })
    return note
  }
}
