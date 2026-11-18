export default {
  group: 'AI アシスタント',
  groupHint: '普段使っている AI アシスタントに Bili Downloader を追加します。追加すると、どの会話でも「このビリビリの動画をダウンロードして」「ビリビリで…を検索して」と言えば Bili Downloader を使って処理します。アプリを更新すると自動で更新されます。',
  installAll: 'ワンクリック設定',
  installAllButton: 'すべてインストール（{count}）',
  installedAll: '{count} 個の AI アシスタントにインストールしました。再起動すると有効になります',
  install: 'インストール',
  update: '更新',
  uninstall: '削除',
  installAnyway: 'それでもインストール',
  forceConfirm: 'このコンピューターで {name} が見つかりません。別の場所にインストールしている場合はそのままインストールできます。設定の書き込み先：{file}',
  installed: '{name} にインストールしました',
  installedRestart: '{name} にインストールしました。{name} を再起動すると有効になります',
  installedTrust: '{name} にインストールしました。{name} の MCP パネルで「信頼」をクリックすると有効になります',
  trustHint: '{name} の MCP パネルで「信頼」をクリックすると有効になります',
  notDetectedHint: 'このコンピューターで {name} が見つかりません',
  uninstalled: '{name} から削除しました',
  withSkill: 'MCP サービスと skill',
  mcpOnly: 'MCP サービスのみ（skill 非対応）',
  skillConflict: '同じ名前の skill が既にあるため、上書きしていません',
  brokenHint: '設定ファイルを読み取れないため、変更していません：{file}',
  state_unsupported: 'このシステムには非対応',
  state_broken: '設定エラー',
  state_outdated: '更新あり',
  state_installed: 'インストール済み',
  state_notDetected: '未検出',
  state_available: 'インストール可能',
  unknown: '不明な AI アシスタント：{id}',
  unsupported: '{name} はこのシステムに対応していません',
  configBroken: '{name} の設定ファイルを読み取れないため、壊さないよう変更していません：{file}。ファイルの内容を確認するか、「AI クライアントを接続」から設定をコピーして手動で追加してください。',

  skillIntro:
    'ユーザーがビリビリ（Bilibili / B站）の動画のダウンロードや検索を求めたとき、またはビリビリのリンクや BV 番号を示したときは、{appName} の MCP ツール（サーバー名 bili-downloader）を使います。独自にスクレイピングしたり、別のダウンロードツールに切り替えたりしないでください。' +
    '{appName} はユーザーのパソコン上のデスクトップアプリで、ファイルはアプリで設定したダウンロードフォルダに保存されます。',
  skillWorkflow: '手順',
  skillSearch: '動画の選び方',
  skillSearchBody:
    '- ユーザーが「一番いい／見る価値がある／おすすめ」の動画を求めているとき：ビリビリのデフォルトの総合順位だけに頼らず、まず search_videos を order=quality で呼び出します（必要なら duration や published_after で絞り込みます）。\n' +
    '- スコアの高い上位 3〜5 本は、get_video_transcript で AI 要約を、get_video_comments でコメントの評判を確認し（必要なら get_video_info で全データも）、内容が合っていてタイトル詐欺でないことを確かめてから、おすすめの動画と再生数・反応のデータ、理由をユーザーに伝えます。\n' +
    '- キーワードが広すぎるときは絞り込むか、duration や published_after で絞ります。quality は候補プール（デフォルト 50 件）の中だけで並べ替えるもので、サイト全体の順位ではありません。候補が足りないときは pool を増やします。\n' +
    '- ユーザーが「一番人気／最新／一番話題／弾幕が多い／一番詳しい／手軽に」と言うときは、search_videos の order パラメータの説明に従って対応する並べ替えを選びます。\n' +
    '- ユーザーが探しているだけなら、おすすめと理由を伝えてからダウンロードするか尋ねます。すでにダウンロードを頼まれているなら、スコアが最も高いもの（または指定されたもの）を download_batch でダウンロードします。検索でアクセス制限にかかったら、数分待ち、続けて再試行しないでください。',
  skillTroubleshoot: 'ツールが使えないとき',
  skillTroubleshootBody:
    '- アプリが起動していないというエラー：ツールが自動で {appName} をバックグラウンドで起動します。数秒待ってから再試行し、それでも失敗する場合はユーザーに {appName} を開いてもらいます。\n' +
    '- MCP サービスがオフというエラー：{appName} > 設定 > AI アシスタント で「MCP サービスを有効にする」をオンにするようユーザーに伝えます。\n' +
    '- bili-downloader のツールが見当たらない：{appName} > 設定 > AI アシスタント で使用中の AI アシスタントの「インストール」をクリックし、再起動するようユーザーに伝えます。'
}
