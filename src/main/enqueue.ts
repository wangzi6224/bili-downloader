import { t } from '@shared/i18n'
import type { EnqueueRequest } from '@shared/types'
import { expandLazy } from './bili/lists'
import type { DownloadManager } from './download/manager'
import { send } from './windows'

/**
 * 加入下载队列的统一入口（界面、订阅、MCP 共用）：
 * 列表里的视频先查出分P，失效的跳过并返回提示。
 */
export function makeEnqueue(manager: DownloadManager) {
  return async (req: EnqueueRequest): Promise<string | undefined> => {
    const items = await expandLazy(req.items, (done, total) =>
      send('parse:progress', { done, total, title: t('misc.fetchingParts') })
    )
    const failed = items.filter((i) => i.unavailable)
    manager.enqueue({ ...req, items: items.filter((i) => !i.unavailable) })
    return failed.length ? t('misc.partsUnavailable', { count: failed.length, reason: failed[0].unavailable! }) : undefined
  }
}
