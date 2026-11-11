import type { Messages } from '../types'

export default {
  interval30m: '30 minutes',
  interval1h: 'hour',
  interval3h: '3 hours',
  interval6h: '6 hours',
  interval12h: '12 hours',
  interval1d: 'day',
  everyInterval: 'Every {interval}',
  title: 'Subscriptions',
  subtitle:
    'While the app is running, favorites folders, collections, anime, uploaders and other sources are checked at set intervals, and new content is downloaded automatically with the options chosen when subscribing.',
  empty: 'No subscriptions yet',
  emptyHint:
    'After parsing a favorites folder, collection, anime or uploader space, click “Subscribe to updates” at the bottom of the selection window to add one.',
  enabled: 'Enabled',
  disabled: 'Disabled',
  lastNew: { one: 'Found {count} new item last time', other: 'Found {count} new items last time' },
  checking: 'Checking…',
  checkNow: 'Check now',
  unsubscribe: 'Unsubscribe',
  unsubscribeConfirm: 'Unsubscribe from “{title}”?'
} satisfies Messages['subs']
