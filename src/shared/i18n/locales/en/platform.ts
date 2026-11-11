import type { Messages } from '../types'

export default {
  macFileManager: 'Finder',
  macReopenFrom: 'Dock or the menu bar icon',
  macAv1Hint: 'Smallest files; requires a Mac with M1 or later',
  macChromiumAuthHint: 'When importing from a Chrome-based browser, macOS will ask for Keychain access. Click “Allow”.',
  linuxFileManager: 'file manager',
  linuxChromiumAuthHint:
    'Login data for Chrome-based browsers is stored in the system keyring. If you’re asked to unlock the keyring during import, enter your login password.',
  winFileManager: 'File Explorer',
  winChromiumAuthHint: 'The browser key is decrypted as the current Windows user during import, so no authorization prompt will appear.',
  trayIcon: 'tray icon',
  av1Hint: 'Smallest files; may stutter on older computers'
} satisfies Messages['platform']
