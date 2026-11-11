import type { Messages } from '../types'

export default {
  qualityBest: 'Максимальное',
  quality1080: '1080P Full HD',
  quality720: '720P HD',
  quality480: '480P SD',
  kindUgc: 'Видео',
  kindPgc: 'Аниме / фильмы и сериалы',
  kindCheese: 'Курс',
  kindAudio: 'Аудио',
  sources: {
    one: '{count} источник',
    few: '{count} источника',
    many: '{count} источников',
    other: '{count} источника'
  },
  loadedOf: {
    one: 'Загружено {count} из {total}',
    few: 'Загружено {count} из {total}',
    many: 'Загружено {count} из {total}',
    other: 'Загружено {count} из {total}'
  },
  totalItems: {
    one: 'Всего {count} элемент',
    few: 'Всего {count} элемента',
    many: 'Всего {count} элементов',
    other: 'Всего {count} элемента'
  },
  downloadedBefore: {
    one: 'Ранее скачан {count} элемент',
    few: 'Ранее скачано {count} элемента',
    many: 'Ранее скачано {count} элементов',
    other: 'Ранее скачано {count} элемента'
  },
  close: 'Закрыть',
  selectAllFiltered: 'Выбрать все найденные',
  selectAll: 'Выбрать все',
  selectNone: 'Снять выбор',
  invert: 'Инвертировать',
  deselectDownloaded: 'Снять скачанные',
  filterPlaceholder: 'Фильтр по названию / автору',
  rangePlaceholder: 'Номера, напр. 1-5,7',
  rangeTitle: 'Выбор по номерам, Enter — применить',
  selectedCount: {
    one: 'Shift — выбор диапазона · выбран {count}',
    few: 'Shift — выбор диапазона · выбрано {count}',
    many: 'Shift — выбор диапазона · выбрано {count}',
    other: 'Shift — выбор диапазона · выбрано {count}'
  },
  groupLoaded: {
    one: 'Загружено {count} из {total}',
    few: 'Загружено {count} из {total}',
    many: 'Загружено {count} из {total}',
    other: 'Загружено {count} из {total}'
  },
  downloadedTitle: 'Этот элемент есть в истории загрузок',
  downloaded: 'Скачано',
  needVip: 'Нужен Premium',
  loadingPage: 'Загрузка страницы {page}…',
  stop: 'Остановить',
  loadNext: 'Загрузить следующую страницу',
  loadAllTitle: 'Между страницами пауза 1 секунда, чтобы слишком частые запросы не вызвали защиту от ботов',
  loadAll: {
    one: 'Загрузить все (остался {count})',
    few: 'Загрузить все (осталось {count})',
    many: 'Загрузить все (осталось {count})',
    other: 'Загрузить все (осталось {count})'
  },
  quality: 'Качество',
  fetchingQualities: 'Получение доступных вариантов качества…',
  vip: 'Premium',
  audioOnlyHint: 'Из аудиораздела скачивается только звук; для звука без потерь нужен Bilibili Premium, без него качество автоматически снижается.',
  fetchingParts: 'Получение частей видео {done}/{total}…',
  dupPrompt: {
    one: 'Среди выбранного {count} элемент уже скачан',
    few: 'Среди выбранного {count} элемента уже скачаны',
    many: 'Среди выбранного {count} элементов уже скачаны',
    other: 'Среди выбранного {count} элемента уже скачаны'
  },
  skipThem: 'Пропустить их',
  downloadAnyway: 'Всё равно скачать',
  downloadCount: {
    one: 'Скачать {count} элемент',
    few: 'Скачать {count} элемента',
    many: 'Скачать {count} элементов',
    other: 'Скачать {count} элемента'
  },
  lazyHint: {
    one: 'Части {count} видео будут запрошены при добавлении в очередь; видео из нескольких частей превратятся в несколько задач',
    few: 'Части {count} видео будут запрошены при добавлении в очередь; видео из нескольких частей превратятся в несколько задач',
    many: 'Части {count} видео будут запрошены при добавлении в очередь; видео из нескольких частей превратятся в несколько задач',
    other: 'Части {count} видео будут запрошены при добавлении в очередь; видео из нескольких частей превратятся в несколько задач'
  },
  subscribeLink: 'Подписаться на обновления: новый контент будет скачиваться автоматически',
  checkInterval: 'Интервал проверки',
  subExisting: 'Скачать и то, что уже есть сейчас (иначе только новое)',
  subHint: 'Используются качество и формат, выбранные выше; проверка идёт только во время работы приложения',
  subscribe: 'Подписаться',
  cancel: 'Отмена',
  subscribed: 'Вы подписались на «{title}»: пока приложение работает, проверка выполняется раз в {interval}, новый контент будет скачиваться автоматически'
} satisfies Messages['selection']
