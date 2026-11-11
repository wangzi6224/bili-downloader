import type { Messages } from '../types'

export default {
  ok: 'OK',
  cancel: 'Cancel',
  logoutMessage: 'Are you sure you want to sign out?',
  logoutDetail: 'You’ll need to import your login or sign in again afterward.',
  logoutConfirm: 'Sign out',
  upToDate: 'You’re up to date',
  currentVersion: 'Current version: {version}',
  quitPending: {
    one: '{count} task is still unfinished. Are you sure you want to quit?',
    other: '{count} tasks are still unfinished. Are you sure you want to quit?'
  },
  quitPendingDetail:
    'Unfinished downloads will be paused. Next time you open the app, click “Resume all” to continue; nothing already downloaded will be lost. Videos whose watermark is being removed will be left as they are.',
  runInBackground: 'Run in background',
  quit: 'Quit',
  closeBrowserMessage: 'Close {browser} to import your Bilibili login?',
  closeBrowserRequest: 'The AI assistant asked to import your Bilibili login, but {browser} is running, so its data can’t be read.',
  closeBrowserRisk: 'Unsaved work may be lost when it closes. If {browser} doesn’t quit in time, it will be forced to quit.',
  closeBrowserAppBound: '{browser} uses app-bound encryption, so the login may still be unreadable after it closes.',
  closeBrowserUnknown: 'It’s not yet known whether {browser} has a Bilibili login.',
  closeBrowserConfirm: 'Close {browser} and import',
  useQrInstead: 'Scan QR code instead',
  loginWindowTitle: 'Sign in to Bilibili',
  chooseDownloadDir: 'Choose download folder'
} satisfies Messages['dialogs']
