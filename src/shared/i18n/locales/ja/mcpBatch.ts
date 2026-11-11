import type { Messages } from '../types'

// MCP のバッチ状態で AI に示す次の手順のヒント
export default {
  expanding:
    '動画のパートを取得し、順次キューに追加しています（{done}/{total}）。追加済みのものから先にダウンロードが始まります。wait_seconds を付けて待機できます',
  interruptedError:
    '動画のパートの取得中にエラーが発生したため（{error}）停止しました。まだ {count} 個の項目がキューに追加されていません。しばらくしてから control_tasks action=resume batch_id={id} を呼び出して再開してください',
  interruptedQuit: 'アプリの終了時に {count} 個の項目がキューに追加されていませんでした。control_tasks action=resume batch_id={id} を呼び出して再開してください',
  waitingAuth: 'ログインが無効になりました。再ログインすると自動で再開します。{loginHint}',
  retrying: 'ダウンロード中です。{count} 件のタスクがエラーのあと自動再試行を待っています。wait_seconds を付けて待機できます',
  downloading: 'ダウンロード中です。wait_seconds を付けて待機できます',
  paused:
    '{count} 件のタスクが一時停止しています（アプリの再起動後、未完了のタスクは自動で一時停止します）。control_tasks action=resume batch_id={id} を呼び出して再開してください',
  retryFailed: 'control_tasks action=retry batch_id={id} を呼び出して、失敗したものを再試行してください',
  unsupported: 'ダウンロード不可（unsupported）のものは、多くの場合プレミアム会員が必要か、地域制限があるか、有料コンテンツのため、再試行しても効果はありません',
  allDownloaded: '選択した項目はすべてダウンロード済みです'
} satisfies Messages['mcpBatch']
