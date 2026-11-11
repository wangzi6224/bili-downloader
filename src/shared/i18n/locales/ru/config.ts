import type { Messages } from '../types'

export default {
  exportTitle: 'Экспорт конфигурации',
  importTitle: 'Импорт конфигурации',
  exported: 'Экспортировано в {path}',
  invalidJson: 'Этот файл не является корректным JSON',
  notOurs: 'Это не файл конфигурации, экспортированный этим приложением',
  imported: {
    one: 'Импортированы настройки и {count} подписка (экспорт {app} от {date})',
    few: 'Импортированы настройки и {count} подписки (экспорт {app} от {date})',
    many: 'Импортированы настройки и {count} подписок (экспорт {app} от {date})',
    other: 'Импортированы настройки и {count} подписки (экспорт {app} от {date})'
  },
  namingInvalid: 'Ошибка в шаблоне имени: {reason}'
} satisfies Messages['config']
