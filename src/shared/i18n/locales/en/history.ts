import type { Messages } from '../types'

export default {
  title: 'Parse history',
  subtitle: 'Every link you’ve parsed is listed here. Click one to reopen the selection window and download the remaining episodes.',
  search: 'Search titles or links',
  clearConfirm: 'Clear all parse history?',
  clear: 'Clear',
  empty: 'No parse history yet',
  emptyHint: 'Links you paste and parse on the Downloads page are saved here automatically.',
  noMatch: 'No matching records',
  kindPgc: 'Anime & TV',
  kindVideo: 'Video',
  itemCount: { one: '{count} item', other: '{count} items' },
  remove: 'Delete this record'
} satisfies Messages['history']
