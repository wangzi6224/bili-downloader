import type { Messages } from '../types'

export default {
  separator: '; ',
  parseFailures: {
    one: 'Не удалось проанализировать {count} ссылку: {errors}',
    few: 'Не удалось проанализировать {count} ссылки: {errors}',
    many: 'Не удалось проанализировать {count} ссылок: {errors}',
    other: 'Не удалось проанализировать {count} ссылки: {errors}'
  },
  watchLater: 'Смотреть позже',
  popular: 'Популярное',
  weekly: 'Еженедельная подборка (последний выпуск)',
  rank: 'Рейтинг: {name}',
  myFavorites: 'Мои папки избранного',
  loading: 'Загрузка…',
  noFavorites: 'Нет папок избранного',
  myMenu: 'Смотреть позже, популярное, мои папки избранного',
  myMenuLoggedOut: 'Доступно после входа: «Смотреть позже», популярное, мои папки избранного',
  batchTitle: 'Пакетный анализ',
  batchSubtitle:
    'По одной ссылке в строке (подойдут BV-номера, аниме, папки избранного, авторы). Ссылки будут проанализированы по очереди и объединены в одно окно выбора.',
  detectedLinks: {
    one: 'Найдена {count} ссылка',
    few: 'Найдено {count} ссылки',
    many: 'Найдено {count} ссылок',
    other: 'Найдено {count} ссылки'
  },
  cancel: 'Отмена',
  parseCount: {
    one: 'Анализировать {count}',
    few: 'Анализировать {count}',
    many: 'Анализировать {count}',
    other: 'Анализировать {count}'
  },
  placeholder: 'Вставьте ссылку на видео, коллекцию, аниме, курс, папку избранного или автора',
  pasteAndParse: 'Вставить из буфера обмена и проанализировать',
  parsing: 'Анализ…',
  parse: 'Анализ',
  batchButton: 'Пакетный анализ: вставить сразу несколько строк со ссылками',
  parsingProgress: 'Анализ {done}/{total}',
  clipboardLinks: {
    one: 'В буфере обмена {count} ссылка',
    few: 'В буфере обмена {count} ссылки',
    many: 'В буфере обмена {count} ссылок',
    other: 'В буфере обмена {count} ссылки'
  },
  clipboardLink: 'В буфере обмена найдена ссылка'
} satisfies Messages['input']
