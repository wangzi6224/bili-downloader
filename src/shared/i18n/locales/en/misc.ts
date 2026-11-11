import type { Messages } from '../types'

export default {
  /** 接口没给会员标签时显示 */
  vipDefault: 'Premium',
  notifyDoneTitle: 'Downloads complete',
  notifyDoneBody: { one: '{count} task completed', other: 'All {count} tasks completed' },
  notifyFailedTitle: 'Downloads finished with failures',
  notifyFailedBody: '{done} completed, {failed} failed',
  notifySubsTitle: 'Subscription updated',
  notifySubsBody: {
    one: '“{title}” has {count} new item, added to downloads',
    other: '“{title}” has {count} new items, added to downloads'
  },
  fetchingParts: 'Fetching video parts',
  partsUnavailable: { one: '{count} video couldn’t be fetched ({reason})', other: '{count} videos couldn’t be fetched ({reason})' }
} satisfies Messages['misc']
