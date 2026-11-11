import type { Messages } from '../types'

export default {
  etaSeconds: '{count} s',
  etaMinutes: '{min} min {sec} s',
  etaHours: '{hours} h {min} min',
  justNow: 'À l’instant',
  minutesAgo: { one: 'Il y a {count} minute', other: 'Il y a {count} minutes' },
  hoursAgo: { one: 'Il y a {count} heure', other: 'Il y a {count} heures' },
  daysAgo: { one: 'Il y a {count} jour', other: 'Il y a {count} jours' },
  checkedJustNow: 'Vérifié à l’instant',
  checkedMinutesAgo: { one: 'Vérifié il y a {count} minute', other: 'Vérifié il y a {count} minutes' },
  checkedHoursAgo: { one: 'Vérifié il y a {count} heure', other: 'Vérifié il y a {count} heures' },
  checkedDaysAgo: { one: 'Vérifié il y a {count} jour', other: 'Vérifié il y a {count} jours' },
  neverChecked: 'Jamais vérifié'
} satisfies Messages['format']
