import type { Messages } from '../types'

export default {
  etaSeconds: '{count} सेकंड',
  etaMinutes: '{min} मिनट {sec} सेकंड',
  etaHours: '{hours} घंटे {min} मिनट',
  justNow: 'अभी-अभी',
  minutesAgo: '{count} मिनट पहले',
  hoursAgo: '{count} घंटे पहले',
  daysAgo: '{count} दिन पहले',
  checkedJustNow: 'अभी-अभी जाँचा गया',
  checkedMinutesAgo: '{count} मिनट पहले जाँचा गया',
  checkedHoursAgo: '{count} घंटे पहले जाँचा गया',
  checkedDaysAgo: '{count} दिन पहले जाँचा गया',
  neverChecked: 'अभी तक जाँचा नहीं गया'
} satisfies Messages['format']
