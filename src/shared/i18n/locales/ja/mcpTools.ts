import type { Messages } from '../types'

// MCP のダウンロード・バッチ・設定系ツール：ツールの説明、パラメータの説明、AI に返すヒント
export default {
  qn: '画質コード。これを超えない範囲で利用可能な最高の画質が選ばれます：127 最高画質、120 4K、116 1080P60、112 1080P+、80 1080P、64 720P、32 480P、16 360P',

  // ダウンロードオプション（options / defaults のフィールド）
  optOutput: '完全な動画 / 音声のみ / 映像のみ（音声なし）',
  optContainer: '動画のコンテナ形式',
  optAudio: '音質：best は自動で最高のものを選びます。指定した音質が取得できない場合は下げます',
  optCodecOrder: '映像コーデックの優先順位。例：["hevc","avc","av1"]',
  optSubtitle: '字幕を .srt として別途保存',
  optEmbedSubtitle: '字幕を動画ファイルに埋め込む',
  optDanmaku: '弾幕をダウンロード',
  optDanmakuFormat: '弾幕の形式',
  optCover: 'カバー画像を画像ファイルとして別途保存',
  optEmbedCover: 'カバー画像を動画 / 音声ファイルに埋め込む',
  optChapters: 'シークバー上の区切りをチャプターとして書き込む',
  optNfo: 'Kodi / Jellyfin 用の NFO メタデータを生成',
  optWatermark:
    '透かし除去：ダウンロード後に画面の隅の透かしを自動で検出して除去します（動画の再エンコードが必要です。検出できない場合や HDR、Dolby Vision の場合は元の動画を残します）。' +
    'auto は高速除去（補間で埋め、数分で完了、透かしの部分は少しぼやける）。ai は AI モデルでフレームごとに補完し、ずっときれいですがかなり遅くなります' +
    '（GPU がある場合で動画の長さの約 2～4 倍、GPU がないとさらに遅い。初回は約 200MB のモデルを先にダウンロードし、ダウンロードできない場合は高速除去に切り替えます）。' +
    'off でも透かしの有無は検出され、結果は get_batch_status の watermark に入ります。あとから remove_watermark で除去できます。ユーザーが透かし除去に触れていない場合は渡す必要はありません',

  getStatusTitle: 'アプリの状態',
  getStatusDesc:
    'ログインとプレミアム会員の状態、ダウンロードキューの概要、合計速度、ダウンロード先とその空き容量、主な設定、注意すべきヒントを返します。最初に呼び出すことを推奨します。',

  parseLinkTitle: 'リンクを解析',
  parseLinkDesc:
    'ビリビリのリンク（動画、コレクション、アニメ、講座、お気に入りフォルダ、投稿者のスペース、後で見るなど）を解析します。ページ分割されたリストは自動でページ送りされます。' +
    '項目が多い場合は offset / limit で分割して読み取ります。結果は 10 分間キャッシュされます。項目の id は固定で、download_batch の ids に渡します。' +
    'リスト内の動画（lazy）はまだパートが展開されていません。ダウンロードに追加するときに自動で展開されます。パートを確認したい場合や一部のパートだけをダウンロードしたい場合は expand_parts を渡します。' +
    "lazy の動画の downloaded='partly' は、少なくとも 1 つのパートがダウンロード済みであることを示します。ダウンロードに追加するときにパートごとに照合されます。",
  parseLinkUrl: 'ビリビリのリンク、BV 番号、またはキーワード「稍后再看」（後で見る）「每周必看」（毎週の必見）「排行榜」（ランキング）。キーワードは中国語のまま渡すこと',
  parseLinkMaxItems: 'ページ送りで最大何件まで取得するか。デフォルトは {n}',
  parseLinkOffset: '何件目から返すか。デフォルトは 0',
  parseLinkLimit: '返す件数。デフォルトは 100',
  parseLinkExpand: '今回返すリスト内の動画のパートを展開します（1 本ずつリクエストするため遅め）。このとき limit の上限は {n}',
  parseLinkRefresh: 'キャッシュを無視して解析し直す',

  downloadTitle: '一括ダウンロード',
  downloadDesc:
    'リンク内の項目を 1 つのバッチとしてダウンロードキューに追加し、すぐに batch_id を返します。リスト内の動画のパートはバックグラウンドで展開されます。' +
    'ids で項目を選ぶか、all=true ですべてダウンロードします。単体の動画のリンクならどちらも渡さなくてかまいません。' +
    'ダウンロードする動画が別々のリンクにある場合（検索結果など）は videos でまとめて送信し、1 本ずつ呼び出さないでください。ダウンロード済みのものはデフォルトでスキップされ、すでにキューにあるものは重複して追加されません。' +
    '元のバッチが終わる前に同じリクエストを再送信すると、元のバッチが返ります（deduplicated=true）。request_id を渡すと冪等キーを明示的に指定できます。',
  downloadUrl: 'parse_link に渡したのと同じリンク。videos とはどちらか一方しか使えません',
  downloadVideos:
    'BV 番号、av 番号、動画のリンク、または b23.tv の短縮リンク（例：search_videos の結果の url）。1 つのバッチにまとめられ、最大 {max} 個、そのうち短縮リンクと av 番号は最大 20 個です。各動画はすべてのパートをダウンロードし、リンクの p パラメータは無視されます。コレクションやお気に入りフォルダなどのリストのリンクには url を使ってください',
  downloadBatchTitle:
    'videos のバッチ名。動画が複数の場合は保存先フォルダの名前にもなります。デフォルト：動画が 1 本ならそのタイトル、複数なら「N 本の動画」',
  downloadIds: 'parse_link が返した項目の id（動画の id はその動画のすべてのパートを表します）',
  downloadAll: 'すべての項目をダウンロード（最大 max_items 件）',
  downloadMaxItems: 'all=true のときに最大何件まで取得するか。デフォルトは {n}。parse_link と同じ値ならそのキャッシュをそのまま使います',
  downloadQn: '{qn}。デフォルトは設定の画質',
  downloadOptions: 'ダウンロードオプション。渡さなかった項目には設定のデフォルト値を使います',
  downloadSubdir: 'ダウンロード先のこのサブフォルダに保存',
  downloadSkip: 'ダウンロード履歴にある項目をスキップ。デフォルトは true',
  downloadRequestId: '冪等キー：同じ request_id では 1 つのバッチしか作成されません',

  batchStatusTitle: 'バッチの進捗',
  batchStatusDesc:
    'バッチの進捗を確認します：状態ごとのタスク数、ダウンロード済みのバイト数、速度、残り時間の見込み、実際の画質、失敗の原因、次の手順のヒント。' +
    'watermark は透かし除去の状況です：ビリビリの透かしを検出した動画の数、除去済みの数、処理中の進捗、そして透かしがあってまだ除去されていない場合に 2 つの方式それぞれにどれくらいかかるか（hint にユーザーへの伝え方があります）。' +
    'wait_seconds が 0 より大きい場合は、バッチ全体が終了するか、一時停止するか、対応が必要になるまで待ってから返します（最大でその秒数まで）。透かし除去中も待機します。繰り返し照会するより効率的です。',
  batchStatusWait: '最大待機秒数。デフォルトは 0',
  batchStatusInclude: '付加する詳細：failed は失敗の一覧（デフォルト）、files は完了したファイルのパス、running はダウンロード中のタスク',

  listBatchesTitle: '最近のバッチ',
  listBatchesDesc: '最近送信したバッチ（新しい順）。batch_id を探し直すときに使います。',
  listBatchesLimit: 'デフォルトは 20',

  listTasksTitle: 'タスク一覧',
  listTasksDesc:
    'ダウンロードタスクをページ単位で確認します。バッチ、状態、タイトルで絞り込めます。状態：queued 待機中、running ダウンロード中、paused 一時停止、retrying 自動再試行待ち、' +
    'failed 失敗、unsupported ダウンロード不可、waiting_auth ログイン待ち、done 完了。active はまだ終わっていないものを表します。',
  listTasksStatus: '1 つ以上の状態。デフォルトは all',
  listTasksQuery: 'タイトルに含まれる文字列',
  listTasksLimit: 'デフォルトは 50',
  listTasksFields: 'これらのフィールドのみを返す',

  controlTitle: 'タスクの一括操作',
  controlDesc:
    'タスクの一時停止、再開、再試行、再ダウンロード、削除、または透かし除去のキャンセルを一括で行います。task_ids、batch_id、status で範囲を指定します（少なくとも 1 つ。組み合わせ可）。' +
    'batch_id だけを指定した場合（task_ids、status なし）はバッチ全体が対象になります：pause / resume ではあとからキューに追加されるタスクも一緒に一時停止 / 再開し、retry ではパートの展開に失敗した項目も再試行し、remove ではまだ処理されていない項目を追加しなくなります。' +
    'redownload はダウンロード済みの部分を削除して最初からダウンロードします。remove は未完了のタスクをキャンセルしてリストから外しますが、ダウンロード済みのファイルは削除しません。' +
    'cancel_watermark は進行中の透かし除去（remove_watermark で開始したもの）をキャンセルし、元の動画はそのまま残ります。',
  controlStatus: 'これらの状態のタスクだけを操作',
  controlUnsupported: 'retry のときに「ダウンロード不可」のタスクも再試行する（例：プレミアム会員に加入したばかりの場合）',

  removeWmTitle: '透かし除去',
  removeWmDesc:
    'ダウンロード済みの動画から画面の隅にあるビリビリの透かしを除去します。バックグラウンドで実行され、完了後に元のファイルを置き換えます（再エンコードあり）。ユーザーが明示的に求めた場合か、同意した場合にのみ呼び出してください。' +
    'method=fast は高速除去：周囲の映像で埋めるため透かしの部分は少しぼやけます。通常は動画の長さの 0.x 倍ほどで済みます。' +
    'method=ai は AI 修復：透かしの下の映像をフレームごとに補完し、ずっときれいですがかなり遅くなります（GPU がある場合で動画の長さの約 2～4 倍）。初回は約 200MB のモデルを先にダウンロードし、ダウンロードできない場合や AI 修復に失敗した場合は高速除去に切り替えます。' +
    'batch_id を使うと、そのバッチ内でダウンロードが完了し、透かしが検出され、まだ除去されていない動画を処理します。task_ids を使うと 1 本ずつ検出します（ダウンロード時に検出していないものは 1 本あたり数秒かかり、1 回に最大 10 本まで検出します）。' +
    '先に dry_run=true を付けて各動画の予想所要時間を取得し、ユーザーに伝えてから本番の呼び出しを行ってください。進捗は get_batch_status または list_tasks の watermark で確認し、キャンセルには control_tasks action=cancel_watermark を使います。',
  removeWmMethod: 'fast は高速除去、ai は AI 修復',
  removeWmTaskIds: '処理するタスク（ダウンロードが完了していること）',
  removeWmBatchId: 'このバッチ内で透かしが検出され、まだ除去されていない動画を処理',
  removeWmRegion:
    '透かしの位置を手動で指定（動画のピクセル座標）。1 つの task_id とだけ併用できます。位置を認識できなかった場合は skipped に動画のサイズと考えられる位置が示されます',
  removeWmForce: '透かし除去済みのものも再処理する（例：高速除去のあとに AI 修復に切り替えたい場合）',
  removeWmDryRun: '検出と所要時間の見積もりだけを行い、処理は開始しない',

  getSettingsTitle: '設定を読み取る',
  getSettingsDesc:
    'ダウンロード関連の設定を読み取ります：ダウンロード先、同時実行数、ファイルごとのスレッド数、速度制限、自動再試行の回数、デフォルトの画質、デフォルトのダウンロードオプション。',

  updateSettingsTitle: '設定を変更',
  updateSettingsDesc: 'ダウンロード関連の設定を変更します。変更する項目だけを渡してください。変更後の設定と、各項目がいつ反映されるかを返します。',
  updateDownloadDir: '絶対パス（~/ で始めてもかまいません）。存在しない場合は作成されます',
  updateConcurrency: '同時にダウンロードするタスクの数',
  updateThreads: 'ファイルごとに同時に開く分割ダウンロードの接続数',
  updateSpeedLimit: '全体の速度制限（KB/s）。0 で無制限',
  updateAutoRetry: 'ネットワークエラー時の自動再試行の回数',
  updateDefaults: 'デフォルトのダウンロードオプション。渡したフィールドだけを変更します',

  // 呼び出し結果
  noSuchTool: 'このツールはありません：{name}',
  noSuchToolHint: 'tools/list で利用できるツールを確認してください',
  downloadDirAbsolute: 'download_dir は絶対パスでなければなりません',
  downloadDirUnusable: 'ダウンロード先が使用できません：{reason}',
  effectDownloadDir: 'これ以降に追加されるタスクにのみ影響します。すでにキューにあるタスクは元のフォルダに保存されます',
  effectConcurrency: 'すぐに反映されます：増やすと待機中のタスクがすぐに開始し、減らしてもダウンロード中のタスクは中断されません',
  effectThreads: 'ダウンロード中のタスクには影響しません。これ以降にダウンロードを開始するタスクや、一時停止から再開するタスクは新しい値で分割されます',
  effectNow: 'すぐに反映されます',
  effectLater: 'これ以降に追加されるタスクにのみ影響します',
  notVip: 'プレミアム会員ではありません：4K や 1080P 高ビットレートなどのプレミアム会員向け画質は取得できず、ダウンロード可能な最高の画質に自動で下がります',
  appNotLoggedIn: 'アプリはログインしていません：リンクの解析にはログインが必要です。{loginHint}',
  loginUnknown: '現在ログイン状態を確認できません（ネットワークの問題の可能性があります）',
  waitingAuth: '{count} 件のタスクがログインを待っています。再ログインすると自動で再開します。{loginHint}',
  paused: '{count} 件のタスクが一時停止しています（アプリの再起動後、未完了のタスクは自動で一時停止します）。control_tasks action=resume で再開できます',
  failed: '{count} 件のタスクが失敗しました。control_tasks action=retry status=failed で再試行できます',
  lowSpace: 'ダウンロード先のディスクの空き容量が 5 GB 未満です',
  pageError: 'ページ送り中にエラーが発生したため（{error}）、最初の {count} 件しか取得できませんでした。しばらくしてから refresh=true を付けて再試行できます',
  truncated: '最初の {count} 件だけを取得しました。さらに必要な場合は max_items を大きくしてください（最大 {max}）',
  moreItems: 'まだ返していない項目があります。offset={next} で続きを読み取ってください',
  lazyItems: 'lazy の項目はまだパートが展開されていない動画で、ダウンロードに追加するときに自動で展開されます',
  dupResumed: '同じリクエストが以前に送信されていたため、前回キューに追加されなかった項目の処理を続けました',
  dupSame:
    '同じリクエストが以前に送信されているため、重複して追加しませんでした。get_batch_status batch_id={id} で進捗を確認してください。再送信する場合は別の request_id を使ってください',
  videosWith: 'videos と {key} は併用できません',
  videosEmpty: 'videos を空にすることはできません',
  videosTooMany: 'videos は 1 回に最大 {max} 個です。いくつかのバッチに分けて送信してください',
  titleTooLong: 'title は {max} 文字以内にしてください',
  videosNone: 'videos にダウンロードできる動画がありません（例：{examples}）。コレクションやお気に入りフォルダなどのリストのリンクには url を使ってください',
  videosTitle: '{count} 本の動画',
  checkProgress: 'get_batch_status batch_id={id} wait_seconds=30 で進捗を確認してください',
  rejected: '{count} 件は対応する動画が見つからなかったため無視しました。rejected を参照してください',
  idsAndAll: 'ids と all はどちらか一方しか使えません',
  idsNone: 'ids がどれもこのリンクに含まれていません（例：{examples}）。先に parse_link で項目の id を確認してください',
  pagedList: 'これは {total} 件のリストです。all=true を渡してすべてダウンロードするか、ids で項目を選んでください',
  unknownIds: '{count} 個の id はこのリンクに含まれていないため無視しました',
  addPageError: 'ページ送り中にエラーが発生したため（{error}）、最初の {count} 件だけを追加しました。しばらくしてからもう一度送信すると残りを追加できます',
  addTruncated: '最初の {count} 件だけを取得し、残りは追加していません。さらに必要な場合は max_items を大きくしてください（最大 {max}）',
  allDownloaded: '選択した項目はすべてダウンロード済みです。再ダウンロードする場合は skip_downloaded=false を渡してください',
  nothingToDownload: 'ダウンロードできる項目がありません',
  controlScope: 'task_ids、batch_id、status のいずれかで操作するタスクを指定してください',
  notWatermarking: '透かし除去は行われていません',
  wrongStatus: '{status} 状態のタスクには {action} を実行できません',
  taskIdsAndBatch: 'task_ids と batch_id はどちらか一方しか使えません',
  nothingToUpdate: '変更する設定がありません。変更できるもの：{names}'
} satisfies Messages['mcpTools']
