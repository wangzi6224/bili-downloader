import type { Messages } from '../types'

export default {
  exportTitle: 'Export configuration',
  importTitle: 'Import configuration',
  exported: 'Exported to {path}',
  invalidJson: 'This file is not valid JSON',
  notOurs: 'This is not a configuration file exported by this app',
  imported: {
    one: 'Imported settings and {count} subscription (exported from {app} on {date})',
    other: 'Imported settings and {count} subscriptions (exported from {app} on {date})'
  },
  namingInvalid: 'Invalid naming template: {reason}'
} satisfies Messages['config']
