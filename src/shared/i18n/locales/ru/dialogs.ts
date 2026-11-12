import type { Messages } from '../types'

export default {
  ok: 'OK',
  cancel: 'Отмена',
  logoutMessage: 'Выйти из аккаунта?',
  logoutDetail: 'После выхода нужно будет снова импортировать данные входа или войти.',
  mcpLogoutMessage: 'ИИ-помощник просит выйти из аккаунта {name}. Выйти?',
  logoutConfirm: 'Выйти',
  upToDate: 'Установлена последняя версия',
  currentVersion: 'Текущая версия {version}',
  quitPending: {
    one: 'Не завершена {count} задача. Всё равно выйти?',
    few: 'Не завершены {count} задачи. Всё равно выйти?',
    many: 'Не завершено {count} задач. Всё равно выйти?',
    other: 'Не завершено {count} задачи. Всё равно выйти?'
  },
  quitPendingDetail:
    'Недокачанные задачи будут приостановлены. При следующем запуске нажмите «Продолжить все», чтобы докачать их, — уже скачанное не пропадёт. Видео, с которых сейчас удаляется водяной знак, останутся без изменений.',
  runInBackground: 'Работать в фоне',
  quit: 'Выйти',
  closeBrowserMessage: 'Закрыть {browser}, чтобы импортировать данные входа Bilibili?',
  closeBrowserRequest: 'ИИ-ассистент просит импортировать данные входа Bilibili, но {browser} запущен, и прочитать его данные не удаётся.',
  closeBrowserRisk: 'После закрытия несохранённые данные могут быть потеряны; если {browser} не закроется вовремя, он будет завершён принудительно.',
  closeBrowserAppBound: 'В {browser} включено шифрование с привязкой к приложению, поэтому даже после закрытия прочитать данные входа может не получиться.',
  closeBrowserUnknown: 'Пока неизвестно, есть ли в {browser} данные входа Bilibili.',
  closeBrowserConfirm: 'Закрыть {browser} и импортировать',
  useQrInstead: 'Войти по QR-коду',
  loginWindowTitle: 'Вход в Bilibili',
  chooseDownloadDir: 'Выберите папку загрузок'
} satisfies Messages['dialogs']
