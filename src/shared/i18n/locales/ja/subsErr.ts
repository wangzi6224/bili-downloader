import type { Messages } from '../types'

export default {
  duplicate: 'このソースはすでに購読しています',
  authExpired: 'ログインが無効になりました。再ログインすると確認を続けます'
} satisfies Messages['subsErr']
