import type { Messages } from '../types'

export default {
  macFileManager: 'Finder',
  macReopenFrom: 'Dock またはメニューバーのアイコン',
  macAv1Hint: '最も容量を節約できます。M1 以降の Mac が必要です',
  macChromiumAuthHint: 'Chrome 系ブラウザからインポートするとき、macOS がキーチェーンへのアクセス許可を求めます。「許可」をクリックしてください。',
  linuxFileManager: 'ファイルマネージャ',
  linuxChromiumAuthHint:
    'Chrome 系ブラウザのログイン情報はシステムのキーリングに保存されています。インポート時にキーリングのロック解除を求められたら、ログインパスワードを入力してください。',
  winFileManager: 'エクスプローラー',
  winChromiumAuthHint: 'インポート時は現在の Windows ユーザーとしてブラウザの鍵を復号するため、許可を求めるウィンドウは表示されません。',
  trayIcon: 'トレイアイコン',
  av1Hint: '最も容量を節約できます。古いコンピュータでは再生がカクつくことがあります'
} satisfies Messages['platform']
