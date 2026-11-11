import type { Messages } from '../types'

export default {
  title: 'Close window',
  subtitle: 'Downloads and subscription checks keep running in the background. You can reopen the window from the {reopenFrom}.',
  pendingTasks: {
    one: '{count} task is still unfinished. Quitting completely will pause it; you can resume it next time you open the app.',
    other: '{count} tasks are still unfinished. Quitting completely will pause them; you can resume them next time you open the app.'
  },
  remember: 'Remember my choice and don’t ask again',
  rememberHint: 'You can change this later in Settings → General',
  cancel: 'Cancel',
  quit: 'Quit',
  background: 'Run in background'
} satisfies Messages['closeDialog']
