import type { Messages } from '../types'

export default {
  noLoginCookie: 'Данные входа в YouTube не найдены (нет SAPISID). Убедитесь, что в браузере выполнен вход в YouTube',
  verifyFailed: 'Не удалось проверить вход в YouTube: {reason}',
  expired: 'Срок действия сеанса YouTube истёк. Войдите в YouTube в браузере заново и повторно импортируйте данные входа',
  accountNotFound: 'Аккаунт YouTube не найден',
  noLoginInBrowser: 'В этом профиле браузера не найдены данные входа в YouTube. Сначала войдите в YouTube в браузере'
} satisfies Messages['ytLogin']
