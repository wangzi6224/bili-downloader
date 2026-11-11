import type { Messages } from '../types'

export default {
  etaSeconds: '{count} s',
  etaMinutes: '{min} min {sec} s',
  etaHours: '{hours} h {min} min',
  justNow: 'Adesso',
  minutesAgo: { one: '{count} minuto fa', other: '{count} minuti fa' },
  hoursAgo: { one: '{count} ora fa', other: '{count} ore fa' },
  daysAgo: { one: '{count} giorno fa', other: '{count} giorni fa' },
  checkedJustNow: 'Controllato adesso',
  checkedMinutesAgo: { one: 'Controllato {count} minuto fa', other: 'Controllato {count} minuti fa' },
  checkedHoursAgo: { one: 'Controllato {count} ora fa', other: 'Controllato {count} ore fa' },
  checkedDaysAgo: { one: 'Controllato {count} giorno fa', other: 'Controllato {count} giorni fa' },
  neverChecked: 'Mai controllato'
} satisfies Messages['format']
