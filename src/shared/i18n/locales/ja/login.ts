import type { Messages } from '../types'

export default {
  windowClosedNotLoggedIn: 'ログインが完了する前にログインウィンドウが閉じられました',
  expiredTitle: 'ビリビリのログインの有効期限が切れました',
  title: 'ビリビリにログイン',
  expiredSubtitle: '解析とダウンロードを続けるには再ログインが必要です。進行中のダウンロードはログイン後に自動で再開されます。',
  subtitle: '自分のアカウントでダウンロードすると、1080P 以上の画質やプレミアム会員向けのコンテンツを入手できます。',
  fromBrowser: 'ブラウザからインポート',
  redetect: '再検出',
  detecting: 'ブラウザを探しています…',
  loggedIn: 'ビリビリにログイン済み',
  cannotImport: 'インポートできません',
  importing: 'インポート中',
  import: 'インポート',
  scanToLogin: 'QR コードでログイン',
  pasteManually: '手動で貼り付け',
  appBoundBanner:
    '{browsers} はアプリバインド暗号化でログイン情報を保護しているため、ブラウザ自身しか読み取れず、このアプリではインポートできません。QR コードでログインするか、ブラウザから Cookie をコピーして手動で貼り付けてください。',
  chooseBrowserFolder: 'ブラウザのフォルダを選択',
  chooseBrowserFolderMessage: 'ブラウザのデータフォルダを選択してください。{path}',
  wrongBrowserFolder: '{path} など、対応するブラウザのデータフォルダを選択してください。',
  macBlocked: 'macOS が {browsers} のデータへのアクセスを拒否しました。ブラウザのデータフォルダを選択して許可するか、アプリ内でログインしてください。',
  blocked:
    '{browsers} のデータを読み取る権限がありません（ブラウザのプロファイルフォルダを現在のユーザーが読み取れません）。下のアプリ内ログインを使うこともできます。',
  locked:
    '{browsers} が実行中のため、ログイン情報を読み取れません。ブラウザを完全に終了してから（バックグラウンドで動作しているものも含む）「再検出」をクリックしてください。',
  lockedAppBound:
    '新しいバージョンの Chrome や Edge はアプリバインド暗号化でログイン情報を保護しているため、終了しても読み取れない可能性が高いです。QR コードでのログインをおすすめします。',
  noBrowserLoggedIn: '見つかったブラウザはいずれもビリビリにログインしていません',
  noBrowserFound: '対応しているブラウザが見つかりません',
  supported: '（{browsers} に対応）',
  notLoggedInList: 'ビリビリ未ログイン：{list}',
  profileLabel: '{browser}（{profile}）',
  inApp: 'アプリ内でログイン',
  inAppHint: 'QR コード、パスワード、SMS でログインできます。ログインに成功するとウィンドウは自動で閉じます',
  waitingLogin: 'ログインの完了を待っています',
  openLoginPage: 'ログインページを開く',
  pasteCookie: 'Cookie を手動で貼り付け',
  pasteHint:
    '「SESSDATA=…; bili_jct=…; DedeUserID=…」のような内容、または Cookie-Editor などの拡張機能でエクスポートした JSON を貼り付けてください。Cookie はログイン認証情報と同等で、このコンピュータにのみ保存されます。',
  pasteStep1: 'ブラウザで bilibili.com を開き、ログインしていることを確認します。',
  pasteStep2: 'F12 キーでデベロッパーツールを開き、「アプリケーション」（Application）→ Cookie → https://www.bilibili.com に進みます。',
  pasteStep3: 'SESSDATA、bili_jct、DedeUserID の値を順にコピーし、上の形式に組み立てて貼り付けます。',
  verifying: '確認中…',
  loginWithCookie: 'この Cookie でログイン'
} satisfies Messages['login']
