import type { Messages } from '../types'

export default {
  etaSeconds: {
    one: '{count} с',
    few: '{count} с',
    many: '{count} с',
    other: '{count} с'
  },
  etaMinutes: '{min} мин {sec} с',
  etaHours: '{hours} ч {min} мин',
  justNow: 'Только что',
  minutesAgo: {
    one: '{count} минуту назад',
    few: '{count} минуты назад',
    many: '{count} минут назад',
    other: '{count} минуты назад'
  },
  hoursAgo: {
    one: '{count} час назад',
    few: '{count} часа назад',
    many: '{count} часов назад',
    other: '{count} часа назад'
  },
  daysAgo: {
    one: '{count} день назад',
    few: '{count} дня назад',
    many: '{count} дней назад',
    other: '{count} дня назад'
  },
  checkedJustNow: 'Проверено только что',
  checkedMinutesAgo: {
    one: 'Проверено {count} минуту назад',
    few: 'Проверено {count} минуты назад',
    many: 'Проверено {count} минут назад',
    other: 'Проверено {count} минуты назад'
  },
  checkedHoursAgo: {
    one: 'Проверено {count} час назад',
    few: 'Проверено {count} часа назад',
    many: 'Проверено {count} часов назад',
    other: 'Проверено {count} часа назад'
  },
  checkedDaysAgo: {
    one: 'Проверено {count} день назад',
    few: 'Проверено {count} дня назад',
    many: 'Проверено {count} дней назад',
    other: 'Проверено {count} дня назад'
  },
  neverChecked: 'Ещё не проверялось'
} satisfies Messages['format']
