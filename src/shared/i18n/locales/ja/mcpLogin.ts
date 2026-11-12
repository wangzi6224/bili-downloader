import type { Messages } from '../types'

// MCP のログインツール：start_login / get_login_status の説明とヒント、ログイン処理の失敗理由
export default {
  startTitle: 'ビリビリにログイン',
  startDesc:
    'ビリビリへのログインに使います。デフォルトではユーザーのブラウザのログイン情報をインポートします：Chrome、その他の Chrome 系、Opera、Firefox、Safari の順に、直接読み取れるものを先に使います。Cookie はアプリ内にのみ保存され、結果には含まれません。' +
    'インポートに失敗した場合は返された next に従います。next=try_qr の場合はユーザーに伝えてから method=qr で QR コードのウィンドウを表示し、get_login_status に wait_seconds を付けてログインの完了を待ちます。' +
    '既定のモードでは、現在のアカウントでログイン済みなら状態をすぐに返します。ブラウザを閉じる必要がある場合はアプリがダイアログでユーザー本人に確認します。ここにはブラウザを直接閉じるパラメータはありません。',
  startMethod: 'browser はブラウザからインポート（デフォルト）、qr はログインウィンドウを表示してユーザーに QR コードをスキャンしてもらう',
  startSource: 'ブラウザを指定します。chrome、edge、opera、firefox、safari など、または get_login_status が列挙したプロファイル id。省略時は自動で選択',
  startWait: '最大待機秒数。デフォルトは {n}。ログインの完了、失敗、またはユーザーの操作が必要になった時点ですぐに返します',

  statusTitle: 'ログインの進捗を確認',
  statusDesc:
    'start_login の進捗を確認します。wait_seconds が 0 より大きい場合は、ログインの成功、失敗、または状態の変化まで待ってから返します。ログインに成功した瞬間にすぐ返るため、これが QR コードのスキャン完了の通知になり、繰り返し照会するより効率的です。' +
    'ユーザーがアプリ内で自分でログインした場合も含まれます。タイムアウトしてもまだ waiting_user の場合は、もう一度呼び出してください。include_browsers=true の場合は、このコンピュータのブラウザと、それぞれにビリビリのログインがあるかどうかを列挙します。',
  statusWait: '最大待機秒数。デフォルトは 0',
  statusBrowsers: 'このコンピュータのブラウザを列挙するかどうか。デフォルトは false',

  // 失敗後の次の手順（reason ごと）
  hintLocked: 'ブラウザが実行中です。ユーザーにブラウザを完全に終了してもらってから（バックグラウンドで動作しているものも含む）再試行するか、QR コードに切り替えてください',
  hintAppBound: 'このブラウザはアプリバインド暗号化でログイン情報を保護しているため読み取れません。QR コードに切り替えてください',
  hintBlocked: 'macOS では {appName} のログイン画面でブラウザのフォルダを選択してください。他のシステムではフォルダの権限を確認してください。QR コードでもログインできます。',
  hintNoLogin:
    'ブラウザにビリビリのログインがありません。ユーザーがブラウザでログインしたばかりの場合は、30 秒ほど待ってから再試行するか（ブラウザはすぐには書き込みません）、QR コードに切り替えてください',
  hintExpired: 'ブラウザのビリビリのログインは無効になっています。QR コードに切り替えるか、ユーザーに先にブラウザで再ログインしてもらってください',
  hintKeychainDenied: 'ユーザーがキーチェーンのダイアログで「許可」をクリックしませんでした。再試行するかどうかユーザーに確認するか、QR コードに切り替えてください',
  hintNetwork: 'ビリビリに接続できないか、アクセス制限でブロックされました。しばらく待ってから再試行してください',
  hintDeclined: 'ユーザーがブラウザを閉じることに同意しませんでした。繰り返し再試行しないでください。start_login method=qr で QR コードを使うかどうかをユーザーに確認してください',
  hintConfirmTimeout: 'ユーザーがダイアログに応答しませんでした。気づいていない可能性があります。ユーザーに注意を促してから再試行するか、QR コードに切り替えてください',
  hintCloseFailed: 'ブラウザを閉じられませんでした。ユーザーに手動で終了してもらってから再試行するか、QR コードに切り替えてください',
  hintWindowClosed: 'ユーザーがログインウィンドウを閉じました。もう一度開くかどうかをユーザーに確認してください',
  hintNotFound: 'get_login_status include_browsers=true でこのコンピュータのブラウザを確認するか、QR コードに切り替えてください',
  hintFailed: '別のブラウザを試すか、QR コードに切り替えてください',

  // 進行中のステップ
  stepChecking: 'ログイン状態を確認中です。get_login_status wait_seconds=30 で結果を待ってください',
  stepImporting:
    'ブラウザのログイン情報を読み取り中です。macOS ではキーチェーンへのアクセス許可、Linux ではキーリングのロック解除を求められることがあるため、「許可」をクリックするようユーザーに伝えてください。get_login_status wait_seconds=30 で結果を待ってください',
  stepConfirmClose: 'アプリがブラウザを閉じるかどうかのダイアログを表示しました。応答するようユーザーに伝えてください。get_login_status wait_seconds=30 で結果を待ってください',
  stepClosingBrowser: 'ユーザーが同意したため、ブラウザを閉じています。get_login_status wait_seconds=30 で結果を待ってください',
  stepQr:
    'ログインウィンドウが開きました。ビリビリのアプリで QR コードをスキャンするようユーザーに伝えてください。get_login_status wait_seconds=50 で結果を待ってください。ログインに成功するとすぐに返ります。タイムアウトした場合はもう一度呼び出してください',

  interrupted: 'これらのバッチは以前に中断されました。control_tasks action=resume batch_id=… で再開してください',

  // ログイン処理の失敗の説明（snapshot.message）
  qrClosed: 'ログインが完了する前にログインウィンドウが閉じられました',
  sourceNotFound: '「{source}」が見つかりません。get_login_status include_browsers=true でこのコンピュータのブラウザを確認できます',
  appBoundLogin: '{browser} のビリビリのログインはアプリバインド暗号化で保存されており、ブラウザ自身しか読み取れません。QR コードに切り替えてください',
  appBoundLocked: '{browser} はアプリバインド暗号化を有効にしているため、終了してもログイン情報を読み取れない可能性が高いです',
  browserRunning: '{browser} が実行中です。ユーザーに手動で終了してもらってからインポートする必要があります',
  noPermission: '{browser} のデータを読み取る権限がありません',
  noLoginIn: '{browser} にビリビリのログイン情報がありません',
  noBrowser: '対応しているブラウザが見つかりません',
  noLoginReadable: '読み取れるブラウザにはいずれもビリビリのログイン情報がなく、{browser} は読み取り権限がありません',
  noLoginAny: '見つかったブラウザにはいずれもビリビリのログイン情報がありません',
  confirmTimeout: 'ユーザーが {browser} を閉じるかどうかのダイアログに応答しませんでした',
  declined: 'ユーザーが {browser} を閉じることに同意しませんでした',
  closeFailed: '{browser} を閉じられませんでした',
  closedNoLogin: '{browser} を閉じましたが、ビリビリのログイン情報はありませんでした'
} satisfies Messages['mcpLogin']
