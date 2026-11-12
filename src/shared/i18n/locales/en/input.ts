import type { Messages } from '../types'

export default {
  separator: '; ',
  parseFailures: { one: '{count} link failed to parse: {errors}', other: '{count} links failed to parse: {errors}' },
  watchLater: 'Watch Later',
  popular: 'Popular',
  weekly: 'Weekly Must-Watch (latest issue)',
  rank: 'Rankings: {name}',
  myFavorites: 'My favorites',
  loading: 'Loading…',
  noFavorites: 'No favorites folders',
  myMenu: 'Watch Later, Popular, My favorites',
  myMenuLoggedOut: 'Sign in to use Watch Later, Popular and My favorites',
  batchTitle: 'Batch parse',
  batchSubtitle:
    'One link per line (BV IDs, anime, favorites folders and uploaders all work). Each one is parsed in turn, then combined into a single selection.',
  detectedLinks: { one: '{count} link found', other: '{count} links found' },
  cancel: 'Cancel',
  parseCount: { one: 'Parse {count} link', other: 'Parse {count} links' },
  placeholder: 'Paste a link to a video, collection, anime, course, favorites folder or uploader',
  pasteAndParse: 'Paste from clipboard and parse',
  clearLink: 'Clear link',
  parsing: 'Parsing',
  parse: 'Parse',
  batchButton: 'Batch parse: paste multiple lines of links at once',
  parsingProgress: 'Parsing {done}/{total}',
  clipboardLinks: { one: '{count} link in the clipboard', other: '{count} links in the clipboard' },
  clipboardLink: 'Link detected in the clipboard'
} satisfies Messages['input']
