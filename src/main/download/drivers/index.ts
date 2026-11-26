import { siteOf } from '@shared/site'
import type { Site, TaskInfo } from '@shared/types'
import { youtube } from '../../youtube/service'
import { biliDriver } from './bili'
import type { PlatformDriver } from './types'
import { createYoutubeDriver } from './youtube'

export type { Acquired, AvAcquired, DriverContext, FilesAcquired, PlatformDriver } from './types'

const DRIVERS: Record<Site, PlatformDriver> = { bili: biliDriver, youtube: createYoutubeDriver(youtube) }

/** 任务所属平台的驱动 */
export function driverFor(t: TaskInfo): PlatformDriver {
  return DRIVERS[siteOf(t)]
}
