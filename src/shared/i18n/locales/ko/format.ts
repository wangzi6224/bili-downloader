import type { Messages } from '../types'

export default {
  etaSeconds: '{count}초',
  etaMinutes: '{min}분 {sec}초',
  etaHours: '{hours}시간 {min}분',
  justNow: '방금',
  minutesAgo: '{count}분 전',
  hoursAgo: '{count}시간 전',
  daysAgo: '{count}일 전',
  checkedJustNow: '방금 확인함',
  checkedMinutesAgo: '{count}분 전에 확인함',
  checkedHoursAgo: '{count}시간 전에 확인함',
  checkedDaysAgo: '{count}일 전에 확인함',
  neverChecked: '아직 확인하지 않음'
} satisfies Messages['format']
