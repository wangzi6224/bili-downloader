import type { Messages } from '../types'

export default {
  title: 'История ссылок',
  subtitle: 'Здесь собраны все проанализированные ссылки. Нажмите на ссылку, чтобы снова открыть окно выбора и скачать оставшиеся серии.',
  search: 'Поиск по названию или ссылке',
  clearConfirm: 'Очистить всю историю ссылок?',
  clear: 'Очистить',
  empty: 'История ссылок пуста',
  emptyHint: 'Ссылки, проанализированные на странице загрузок, автоматически сохраняются здесь.',
  noMatch: 'Ничего не найдено',
  kindPgc: 'Аниме и кино',
  kindVideo: 'Видео',
  itemCount: {
    one: '{count} элемент',
    few: '{count} элемента',
    many: '{count} элементов',
    other: '{count} элемента'
  },
  remove: 'Удалить запись'
} satisfies Messages['history']
