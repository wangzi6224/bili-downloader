import type { Messages } from '../types'

export default {
  duplicate: 'Вы уже подписаны на этот источник',
  authExpired: 'Сеанс истёк; после повторного входа проверка продолжится'
} satisfies Messages['subsErr']
