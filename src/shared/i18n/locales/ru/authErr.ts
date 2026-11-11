import type { Messages } from '../types'

export default {
  loginRequired: 'Сначала войдите в аккаунт',
  loginRequiredAccount: 'Сначала войдите в аккаунт Bilibili',
  loginExpired: 'Сеанс истёк, войдите снова',
  appBoundCookie: 'Cookie, защищённые шифрованием с привязкой к приложению, импортировать нельзя. Войдите в приложении или вставьте cookie вручную',
  missingKey: 'Нет ключа для расшифровки {prefix}',
  incompleteCookie: 'Зашифрованные данные cookie Chromium неполные',
  /** 没有权限读取的浏览器，在配置档名的位置显示 */
  blockedProfile: 'нет доступа на чтение',
  keychainNotFound: '«{service}» не найден в связке ключей',
  keychainDenied: 'Не получен доступ к связке ключей ({service}). Нажмите «Разрешить» в системном окне',
  secretToolMissing:
    'Для чтения данных входа браузеров на базе Chrome нужен secret-tool. Установите его (Debian / Ubuntu: sudo apt install libsecret-tools) или войдите в приложении',
  keyringNotFound:
    'Пароль браузера не найден в системной связке ключей (application={application}), или связка ключей не разблокирована. Можно также войти в приложении',
  winKeyUnreadable: 'Не удалось прочитать ключ шифрования браузера в Windows. Войдите в приложении или вставьте cookie вручную',
  winKeyMissing: 'У браузера в Windows нет доступного для чтения ключа DPAPI. Войдите в приложении или вставьте cookie вручную',
  winKeyUnsupported: 'Формат ключа браузера в Windows не поддерживается. Войдите в приложении или вставьте cookie вручную',
  browserLocked:
    'Пока {browser} запущен, прочитать данные входа не удаётся. Полностью закройте {browser} (включая фоновые процессы) и повторите импорт или войдите в приложении',
  profileNotFound: 'Профиль браузера не найден или нет прав на его чтение',
  noPermission: 'Нет прав на чтение данных {browser}',
  noLogin: 'В {browser} ({profile}) нет данных входа Bilibili',
  importedExpired: 'Импортированные данные входа недействительны. Сначала снова войдите в Bilibili в браузере или войдите в приложении',
  cookieUnreadable: 'Не удалось распознать содержимое. Вставьте cookie вида «SESSDATA=…; bili_jct=…» или JSON, экспортированный расширением',
  noSessdata: 'В них нет SESSDATA, войти невозможно',
  cookieExpired: 'Эти cookie больше недействительны, получите их заново',
  confirmTimeout: 'Время ожидания подтверждения входа истекло, проверьте подключение к сети',
  importCancelled: 'Импорт отменён',
  dpapiTimeout: 'Время расшифровки DPAPI истекло. Войдите в приложении или вставьте cookie вручную',
  dpapiFailed: 'Ошибка расшифровки DPAPI: {reason}',
  powershellExitCode: 'Код выхода PowerShell: {code}',
  dpapiIncomplete: 'PowerShell вернул неполный результат расшифровки',
  safariCorrupt: 'Файл cookie Safari повреждён',
  notSafariCookies: 'Это не файл cookie Safari'
} satisfies Messages['authErr']
