import type { Messages } from '../types'

export default {
  windowClosedNotLoggedIn: 'The login window was closed before you finished signing in',
  expiredTitle: 'Your Bilibili login has expired',
  title: 'Sign in to Bilibili',
  expiredSubtitle: 'Sign in again to keep parsing and downloading. Downloads in progress will resume once you are signed in.',
  subtitle: 'Sign in with your own account to download in 1080P and above, plus Bilibili Premium content.',
  fromBrowser: 'Import from a browser',
  redetect: 'Detect again',
  detecting: 'Looking for browsers…',
  loggedIn: 'Signed in to Bilibili',
  cannotImport: "Can't import",
  importing: 'Importing',
  import: 'Import',
  scanToLogin: 'Scan QR code',
  pasteManually: 'Paste manually',
  appBoundBanner:
    '{browsers} protects its login data with app-bound encryption, so only the browser itself can read it and this app cannot import it. Sign in by scanning a QR code, or copy the cookies from the browser and paste them below.',
  openSystemSettings: 'Open System Settings',
  macBlocked:
    'macOS does not allow this app to read data from {browsers}. To import from them, turn this app on in System Settings → Privacy & Security → Full Disk Access, then restart it. Or just sign in inside the app below.',
  blocked:
    "Can't read data from {browsers} (the current user is not allowed to read the browser's profile folder). You can sign in inside the app below.",
  locked: "{browsers} is running, so its login data can't be read. Quit the browser completely (including background processes), then click “Detect again”.",
  lockedAppBound:
    'Recent versions of Chrome and Edge protect login data with app-bound encryption, so it likely still can’t be read after quitting. Scanning a QR code is recommended.',
  noBrowserLoggedIn: 'None of the browsers found are signed in to Bilibili',
  noBrowserFound: 'No supported browser found',
  supported: ' (supports {browsers})',
  notLoggedInList: 'Not signed in to Bilibili: {list}',
  profileLabel: '{browser} ({profile})',
  inApp: 'Sign in inside the app',
  inAppHint: 'QR code, password or SMS. The window closes automatically once you are signed in',
  waitingLogin: 'Waiting for sign-in',
  openLoginPage: 'Open sign-in page',
  pasteCookie: 'Paste cookies manually',
  pasteHint:
    'Paste something like “SESSDATA=…; bili_jct=…; DedeUserID=…”, or JSON exported by an extension such as Cookie-Editor. Cookies work like login credentials and are only stored on this computer.',
  pasteStep1: 'Open bilibili.com in your browser and make sure you are signed in;',
  pasteStep2: 'Press F12 to open the developer tools and go to Application → Cookies → https://www.bilibili.com;',
  pasteStep3: 'Copy the values of SESSDATA, bili_jct and DedeUserID and paste them in the format above.',
  verifying: 'Verifying…',
  loginWithCookie: 'Sign in with these cookies'
} satisfies Messages['login']
