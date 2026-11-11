import type { Messages } from '../types'

export default {
  etaSeconds: '{count} 秒',
  etaMinutes: '{min} 分 {sec} 秒',
  etaHours: '{hours} 時間 {min} 分',
  justNow: 'たった今',
  minutesAgo: '{count} 分前',
  hoursAgo: '{count} 時間前',
  daysAgo: '{count} 日前',
  checkedJustNow: 'たった今確認',
  checkedMinutesAgo: '{count} 分前に確認',
  checkedHoursAgo: '{count} 時間前に確認',
  checkedDaysAgo: '{count} 日前に確認',
  neverChecked: 'まだ確認していません'
} satisfies Messages['format']
