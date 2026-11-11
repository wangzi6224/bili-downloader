import type { Messages } from '../types'

export default {
  duplicate: 'You’re already subscribed to this source',
  authExpired: 'Login expired; checking will resume after you sign in again'
} satisfies Messages['subsErr']
