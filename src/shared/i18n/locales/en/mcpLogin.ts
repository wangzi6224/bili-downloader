// MCP 登录工具：start_login / get_login_status 的说明、提示，以及登录流程的失败原因
import type { Messages } from '../types'

export default {
  startTitle: 'Sign in to Bilibili',
  startDesc:
    'Use this to sign in to Bilibili. By default it imports the login from the user’s browsers in this order: Chrome, other Chrome-based browsers, Opera, Firefox, Safari, using the first one that can be read directly. The cookies are stored only in the app and are not included in the result. ' +
    'If the import fails, follow the returned next action: when next=try_qr, tell the user, then use method=qr to open the QR code window, and use get_login_status with wait_seconds to wait for sign-in to complete. ' +
    'In the default mode, an already signed-in account is returned immediately. If a browser needs to be closed, the app asks the user directly in a dialog; there is no parameter here to close it directly.',
  startMethod: 'browser imports from a browser (default); qr opens a sign-in window for the user to scan a QR code',
  startSource:
    'A specific browser, such as chrome, edge, opera, firefox or safari, or a profile id listed by get_login_status. Chosen automatically if omitted',
  startWait: 'Maximum number of seconds to wait, default {n}. Returns immediately when sign-in completes, fails or needs user action',

  statusTitle: 'Check sign-in progress',
  statusDesc:
    'Checks the progress of start_login. When wait_seconds is greater than 0, it waits until sign-in succeeds, fails or the state changes before returning: it returns the moment sign-in succeeds, which serves as the notification that the QR code was scanned, and saves polling repeatedly. ' +
    'Signing in by the user directly in the app also counts. If it is still waiting_user after the timeout, call it again. With include_browsers=true it lists the browsers on this computer and whether each has a Bilibili login.',
  statusWait: 'Maximum number of seconds to wait, default 0',
  statusBrowsers: 'Whether to list the browsers on this computer, default false',

  // 失败后的下一步（按 reason）
  hintLocked:
    'The browser is running. You can ask the user to quit the browser completely (including background processes) and try again, or use a QR code instead',
  hintAppBound: 'This browser protects its login data with app-bound encryption, so it can’t be read. Use a QR code instead',
  hintBlocked: 'On macOS, choose the browser folder in the {appName} sign-in window. On other systems, check the folder permissions. You can also sign in with a QR code.',
  hintNoLogin:
    'There is no Bilibili login in the browser. If the user just signed in in the browser, wait half a minute and try again (the browser doesn’t write it immediately), or use a QR code instead',
  hintExpired: 'The Bilibili login in the browser has expired. Use a QR code instead, or ask the user to sign in again in the browser first',
  hintKeychainDenied: 'The user didn’t click “Allow” in the Keychain prompt. Ask the user whether to try again, or use a QR code instead',
  hintNetwork: 'Can’t reach Bilibili, or the request was blocked by rate limiting. Wait a while and try again',
  hintDeclined: 'The user declined to close the browser; don’t retry repeatedly. Ask the user whether to scan a QR code with start_login method=qr',
  hintConfirmTimeout:
    'The user didn’t answer the dialog and may not have seen it. Remind the user to look out for it and try again, or use a QR code instead',
  hintCloseFailed: 'The browser couldn’t be closed. You can ask the user to quit it manually and try again, or use a QR code instead',
  hintWindowClosed: 'The user closed the sign-in window. Ask the user whether to open it again',
  hintNotFound: 'Use get_login_status include_browsers=true to see the browsers on this computer, or use a QR code instead',
  hintFailed: 'Try a different browser, or use a QR code instead',

  // 进行中的步骤
  stepChecking: 'Checking the sign-in status. Use get_login_status wait_seconds=30 to wait for the result',
  stepImporting:
    'Reading the login from the browser. macOS may show a Keychain access prompt and Linux may ask to unlock the keyring; remind the user to click “Allow”. Use get_login_status wait_seconds=30 to wait for the result',
  stepConfirmClose:
    'The app is showing a dialog asking whether to close the browser; remind the user to answer it. Use get_login_status wait_seconds=30 to wait for the result',
  stepClosingBrowser: 'The user agreed; closing the browser. Use get_login_status wait_seconds=30 to wait for the result',
  stepQr:
    'The sign-in window is open; tell the user to scan the QR code with the Bilibili app. Use get_login_status wait_seconds=50 to wait for the result; it returns immediately when sign-in succeeds, and if it times out, call it again',

  interrupted: 'These batches were interrupted earlier; use control_tasks action=resume batch_id=… to continue',

  // 登录流程的失败说明（snapshot.message）
  qrClosed: 'The sign-in window was closed before sign-in succeeded',
  sourceNotFound: '“{source}” was not found. Use get_login_status include_browsers=true to see the browsers on this computer',
  appBoundLogin: 'The Bilibili login in {browser} is stored with app-bound encryption, which only the browser itself can read. Use a QR code instead',
  appBoundLocked: '{browser} uses app-bound encryption, so the login will most likely still be unreadable after it quits',
  browserRunning: '{browser} is running; the user needs to quit it manually before importing',
  noPermission: 'No permission to read data from {browser}',
  noLoginIn: 'No Bilibili login in {browser}',
  noBrowser: 'No supported browser found',
  noLoginReadable: 'None of the readable browsers have a Bilibili login; there is no permission to read {browser}',
  noLoginAny: 'None of the browsers found have a Bilibili login',
  confirmTimeout: 'The user didn’t answer the dialog asking whether to close {browser}',
  declined: 'The user declined to close {browser}',
  closeFailed: 'Couldn’t close {browser}',
  closedNoLogin: '{browser} was closed, but it has no Bilibili login'
} satisfies Messages['mcpLogin']
