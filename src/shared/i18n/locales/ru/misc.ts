import type { Messages } from '../types'

export default {
  /** 接口没给会员标签时显示 */
  vipDefault: 'Bilibili Premium',
  notifyDoneTitle: 'Загрузка завершена',
  notifyDoneBody: {
    one: 'Завершена {count} задача',
    few: 'Завершены все {count} задачи',
    many: 'Завершены все {count} задач',
    other: 'Завершены все {count} задачи'
  },
  notifyFailedTitle: 'Загрузка завершена, есть ошибки',
  notifyFailedBody: 'Завершено: {done}, с ошибкой: {failed}',
  notifySubsTitle: 'Новое в подписках',
  notifySubsBody: {
    one: '«{title}»: {count} новый элемент добавлен в загрузки',
    few: '«{title}»: {count} новых элемента добавлены в загрузки',
    many: '«{title}»: {count} новых элементов добавлены в загрузки',
    other: '«{title}»: {count} новых элемента добавлены в загрузки'
  },
  fetchingParts: 'Получение частей видео',
  partsUnavailable: {
    one: 'Не удалось получить {count} видео ({reason})',
    few: 'Не удалось получить {count} видео ({reason})',
    many: 'Не удалось получить {count} видео ({reason})',
    other: 'Не удалось получить {count} видео ({reason})'
  }
} satisfies Messages['misc']
