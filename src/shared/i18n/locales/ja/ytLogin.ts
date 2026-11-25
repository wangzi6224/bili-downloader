import type { Messages } from '../types'

export default {
  noLoginCookie: 'YouTube のログイン情報が見つかりません（SAPISID がありません）。ブラウザで YouTube にログインしているか確認してください',
  verifyFailed: 'YouTube のログインを確認中にエラーが発生しました：{reason}',
  expired: 'この YouTube のログインは無効になっています。ブラウザで YouTube に再ログインしてから、もう一度インポートしてください',
  accountNotFound: 'この YouTube アカウントが見つかりません',
  noLoginInBrowser: 'このブラウザのプロファイルには YouTube のログイン情報がありません。先にブラウザで YouTube にログインしてください'
} satisfies Messages['ytLogin']
