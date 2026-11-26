import { siteOf } from '@shared/site'
import type { Site, TaskInfo } from '@shared/types'
import { douyin } from '../../douyin/service'
import { youtube } from '../../youtube/service'
import { biliDriver } from './bili'
import { createDouyinDriver } from './douyin'
import type { PlatformDriver } from './types'
import { createYoutubeDriver } from './youtube'

export type { Acquired, AvAcquired, DriverContext, FilesAcquired, PlatformDriver } from './types'

const DRIVERS: Record<Site, PlatformDriver> = {
  bili: biliDriver,
  youtube: createYoutubeDriver(youtube),
  douyin: createDouyinDriver(douyin)
}

/** 任务所属平台的驱动 */
export function driverFor(t: TaskInfo): PlatformDriver {
  return DRIVERS[siteOf(t)]
}
