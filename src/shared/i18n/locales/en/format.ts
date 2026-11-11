import type { Messages } from '../types'

export default {
  etaSeconds: '{count}s',
  etaMinutes: '{min}m {sec}s',
  etaHours: '{hours}h {min}m',
  justNow: 'Just now',
  minutesAgo: { one: '{count} minute ago', other: '{count} minutes ago' },
  hoursAgo: { one: '{count} hour ago', other: '{count} hours ago' },
  daysAgo: { one: '{count} day ago', other: '{count} days ago' },
  checkedJustNow: 'Checked just now',
  checkedMinutesAgo: { one: 'Checked {count} minute ago', other: 'Checked {count} minutes ago' },
  checkedHoursAgo: { one: 'Checked {count} hour ago', other: 'Checked {count} hours ago' },
  checkedDaysAgo: { one: 'Checked {count} day ago', other: 'Checked {count} days ago' },
  neverChecked: 'Not checked yet'
} satisfies Messages['format']
