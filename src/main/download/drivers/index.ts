import { siteOf } from '@shared/site'
import type { TaskInfo } from '@shared/types'
import { youtube } from '../../youtube/service'
import { biliDriver } from './bili'
import type { PlatformDriver } from './types'
import { createYoutubeDriver } from './youtube'

export type { Acquired, DriverContext, PlatformDriver } from './types'

const youtubeDriver = createYoutubeDriver(youtube)

/** 任务所属平台的驱动 */
export function driverFor(t: TaskInfo): PlatformDriver {
  return siteOf(t) === 'youtube' ? youtubeDriver : biliDriver
}
