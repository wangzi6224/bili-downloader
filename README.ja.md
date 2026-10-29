<div align="center">

<img src="build/icon.png" width="128" alt="Bili Downloader のアイコン">

# Bili Downloader

bilibili のリンクを貼り付けるだけで、動画・複数パート動画・コレクション・アニメ・映画をダウンロードできる macOS / Linux 向けデスクトップアプリです。

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
![macOS 12+](https://img.shields.io/badge/macOS-12%2B-black?logo=apple)
![Apple Silicon | Intel](https://img.shields.io/badge/arch-Apple%20Silicon%20%7C%20Intel-blue)
![Linux x64](https://img.shields.io/badge/Linux-x64-black?logo=linux)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語** | [한국어](README.ko.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="ダウンロードキュー">
  <img src="docs/screenshots/select.png" width="49%" alt="エピソード・画質・追加コンテンツの選択">
</p>

> [!NOTE]
> 本プロジェクトは非公式のツールであり、bilibili とは一切関係がなく、承認も受けていません。ご自身のアカウントで視聴権限のあるコンテンツのみを個人利用の範囲でダウンロードし、クリエイターの権利と bilibili の利用規約を尊重してください。

## 機能

### 対応リンク

- 通常の動画（BV / av）、複数パート動画、コレクション、アニメ・映画（ep / ss / md）、有料講座
- お気に入りフォルダ、「あとで見る」、投稿者（UP 主）の投稿動画・コレクション・シリーズ（キーワードで絞り込み可能）
- 音声・プレイリスト（au / am）、「每周必看」（週間おすすめ）、カテゴリ別ランキング
- b23.tv などの短縮リンクや、タイトル付きの共有テキスト
- 複数のリンクを一度に解析。お気に入りや投稿一覧などのページ分割リストは 1 ページずつ読み込み可能

### 画質とフォーマット

- 画質一覧は API から取得（8K / Dolby Vision / HDR / 4K / 1080P60 …）、プレミアム会員（大会员）限定の画質を表示
- コーデック優先順位 AVC / HEVC / AV1、音声は Dolby Atmos や Hi-Res ロスレス FLAC まで対応
- 完全な動画・音声のみ・映像のみ、MP4 または MKV
- ffmpeg でストリームをそのままコピーして結合し、再エンコードしません

### 追加コンテンツ

- カバー画像：画像として保存、またはファイルに埋め込み
- CC 字幕：`.srt` として保存、または動画に埋め込み
- 弾幕（コメント）：`.ass` および／または `.xml`、フォントサイズ・不透明度・表示時間を調整可能
- bilibili のシークバーのセクションを本物のチャプターとして書き込み
- Kodi / Jellyfin メディアライブラリ用の NFO メタデータ

### キューとネットワーク

- 同時ダウンロード数、ファイル単位の分割マルチスレッド、速度制限、ネットワークエラー時の自動リトライを調整可能
- 一時停止・再開・レジューム（再起動後も可）。ダウンロードできないタスクには理由を表示
- プロキシ：直接接続、システム設定、手動設定。内蔵の速度テストで最速の bilibili CDN ノードを選択可能
- ダウンロード中のスリープ防止（またはディスプレイ常時点灯）、キュー完了時の通知

### 整理と自動化

- 命名テンプレート：変数（`{title}`、`{series}`、`{index:03}`、`{pubdate:YYYY-MM-DD}` など）、省略可能なセグメント、フォルダ階層に対応。単体動画・コレクション・アニメで個別に設定可能
- ダウンロード済みのコンテンツを検出し、確認・スキップ・再ダウンロードを選択
- 購読：お気に入り、コレクション、投稿者などを定期的にチェックし、新しいコンテンツを自動でダウンロード
- 解析履歴、クリップボード監視、ライト／ダークテーマ、バックグラウンド実行、設定のインポート／エクスポート
- GitHub Releases からのアプリ内アップデート（更新内容の表示、特定バージョンのスキップに対応）

### AI 連携

- ローカルの [MCP](https://modelcontextprotocol.io) サーバーにより、Claude などの AI クライアントからリンクの解析、ダウンロードの追加、進捗確認が可能（下記の **MCP サーバー** を参照）

## インストール

### macOS

1. [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) から最新の `.dmg` をダウンロードします：
   - Apple シリコン（M1 以降）：`bili-downloader-<version>-arm64.dmg`
   - Intel：`bili-downloader-<version>-x64.dmg`
2. dmg を開き、**B站下载器** を **アプリケーション** にドラッグします。
3. アプリは ad-hoc 署名のみで公証されていないため、初回起動時に macOS にブロックされます。一度開こうとした後、**システム設定 → プライバシーとセキュリティ** で **このまま開く** をクリックしてください（macOS 15 以降、右クリック →「開く」は使えません）。またはターミナルで次を実行します：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

macOS 12 以降が必要です。

### Linux

[Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) から次のいずれかをダウンロードします（64 ビット x86 のみ）：

- **AppImage**（ディストリビューションを問わず利用可能、自動アップデート対応）：`bili-downloader-<version>-x86_64.AppImage`。実行権限を付けてから起動します：

  ```bash
  chmod +x bili-downloader-*-x86_64.AppImage
  ./bili-downloader-*-x86_64.AppImage
  ```

  AppImage の実行には FUSE 2 が必要です。起動しない場合は FUSE 2 をインストールするか（Ubuntu 24.04 以降は `sudo apt install libfuse2t64`、それより前のリリースでは `libfuse2`）、`--appimage-extract-and-run` を付けて実行してください。
- **deb**（Debian、Ubuntu とその派生ディストリビューション）：`bili-downloader-<version>-amd64.deb`。`sudo apt install ./bili-downloader-<version>-amd64.deb` でインストールすると、アプリケーションメニューに **B站下载器** が表示されます。

ウィンドウを閉じてバックグラウンドで動作しているときは、トレイアイコンをクリックするとウィンドウが再表示されます。GNOME ではトレイアイコンの表示に AppIndicator 拡張機能が必要です（Ubuntu には標準で入っています）。メニューバーは非表示になっており、<kbd>Alt</kbd> キーを押すと表示されます。

### アップデート

インストール後はアプリが自動でアップデートを確認します。macOS 版と Linux の AppImage 版はそのままアップデートをインストールできます。deb 版では更新内容を表示し、ダウンロードページへ案内します。

UI は現在簡体字中国語のみです。以下では画面上の表記を中国語の原文で示し、括弧内に日本語訳を添えています。

## クイックスタート

1. bilibili アカウントにログインします（下記の **ログイン** を参照）。リンクの解析にはログインが必要です。
2. bilibili のリンクをコピーします。アプリに戻るとクリップボードから自動で読み取ります。入力欄で <kbd>⌘</kbd><kbd>V</kbd>（Linux では <kbd>Ctrl</kbd><kbd>V</kbd>）を押して **解析** をクリックすることもできます。
3. ダウンロードする項目を選びます。全選択、選択の反転、<kbd>Shift</kbd> による範囲選択、タイトルや番号（例：`1-5,7`）での絞り込みが可能です。
4. 画質、出力形式、追加コンテンツを選び、**下载**（ダウンロード）をクリックします。

リンクの代わりに次のキーワードも入力できます：`稍后再看` または `watchlater`（あとで見る）、`每周必看`（週間おすすめ）、`排行榜`（ランキング）。

## ログイン

ログインすると、ご自身のアカウントで視聴できる画質とコンテンツ（1080P 以上、プレミアム会員向けコンテンツ）を取得できます。方法は 3 つあります：

- **从浏览器导入**（ブラウザからインポート）：Chrome、Edge、Brave、Arc（macOS のみ）、Vivaldi、Chromium、Firefox のログイン Cookie を再利用します。
  - Chrome、Edge、Brave のデータは macOS のプライバシー保護の対象のため、先に **システム設定 → プライバシーとセキュリティ → フルディスクアクセス** で本アプリを許可し、アプリを再起動してください。Chromium 系ブラウザからのインポートではキーチェーンへのアクセス許可も求められます。
  - Linux では、Chromium 系ブラウザは Cookie の暗号化キーをシステムのキーリング（GNOME Keyring / libsecret）に保存しています。アプリは `secret-tool`（`sudo apt install libsecret-tools` でインストール）でこのキーを読み取ります。その際、キーリングのロック解除を求められることがあります。Snap 版・Flatpak 版の Firefox と Snap 版の Chromium にも対応しています。
- **在应用内登录**（アプリ内でログイン）：bilibili 公式のログインページを開きます。QR コード、パスワード、SMS でのログインに対応しています。
- **手动粘贴 Cookie**（Cookie を手動で貼り付け）：セミコロン区切りの Cookie 文字列、またはブラウザ拡張機能でエクスポートした JSON。

アプリは起動時、ウィンドウに戻ったとき、リンクの解析時、そして API がログイン切れを返したときにログイン状態を確認します。ログインの有効期限が切れるとログインダイアログを表示し、ストリームの取得を一時停止して、再ログイン後にキューを自動で再開します。ログアウトはアプリ自身の Cookie を削除するだけで、ブラウザのログインには影響しません。

## MCP サーバー

アプリはローカルの [Model Context Protocol](https://modelcontextprotocol.io) サーバーを起動でき、AI クライアントからダウンロードキューを操作できます。

1. **设置 → 网络与高级 → MCP 服务**（設定 → ネットワークと詳細 → MCP サーバー）で有効にします。
2. 同じセクションのボタンで、クライアント設定（JSON）または Claude Code のコマンドをコピーします。アクセストークンは入力済みです。

```json
{
  "mcpServers": {
    "bili-downloader": {
      "type": "http",
      "url": "http://127.0.0.1:39231/mcp",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}
```

```bash
claude mcp add --transport http bili-downloader http://127.0.0.1:39231/mcp --header "Authorization: Bearer <your-token>"
```

| ツール | 説明 |
| --- | --- |
| `get_status` | ログインと大会員の状態、キューの概要、保存先の空き容量、注意が必要な点。最初に呼ぶのがおすすめ |
| `parse_link` | bilibili のリンク（動画、コレクション、アニメ、講座、お気に入り、投稿者など）を解析。一覧は自動でページをめくる。項目 ID は固定で、分けて読み込んだり分P を展開したりできる |
| `download_batch` | リンク全体または選んだ項目を 1 つのバッチとしてキューに追加し、`batch_id` を返す。ダウンロード済みの項目は既定でスキップし、同じ依頼を再送しても二重にダウンロードしない |
| `get_batch_status` | バッチの進捗：状態ごとの件数、速度、残り時間の目安、実際の画質、失敗の理由。`wait_seconds` で変化を待てる |
| `list_batches` | 最近送信したバッチ |
| `list_tasks` | タスクをページ単位で表示（バッチ、状態、タイトルで絞り込み可能） |
| `control_tasks` | タスクをまとめて一時停止・再開・再試行・再ダウンロード・削除（ダウンロード済みのファイルは削除しない） |
| `get_settings` / `update_settings` | 保存先、同時ダウンロード数、スレッド数、速度制限、自動再試行、既定の画質とダウンロードオプションの取得・変更 |

サーバーは `127.0.0.1` のみで待ち受け（ポートは変更可能）、Bearer トークンが必須で、DNS リバインディング対策として `Host` / `Origin` ヘッダーを検証します。トークンはいつでも再生成できます。

## 制限事項

- DRM で保護されたコンテンツ、地域制限のあるコンテンツ、アカウントに視聴権限のないコンテンツはダウンロードできません。これらのタスクは **无法下载**（ダウンロード不可）と表示され、理由が示されます。
- 対応 OS は macOS と Linux（x64）のみで、Windows 版はありません。Linux で自動アップデートに対応しているのは AppImage 版だけです。

## ソースからのビルド

macOS または Linux、Node.js 22.12 以降、npm が必要です。

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run dev          # 開発モード
npm test             # ユニットテスト
npm run typecheck    # 型チェック
npm run build:mac    # macOS 上で実行：dist/ に x64 と arm64 の dmg / zip を生成
npm run build:linux  # Linux 上で実行：dist/ に x64 の AppImage / deb を生成
```

開発の流れは [CONTRIBUTING.md](CONTRIBUTING.md)（英語）、パッケージングとリリースは [docs/RELEASING.md](docs/RELEASING.md)（中国語）を参照してください。

## プロジェクト構成

```
src/main/auth               ログイン：Cookie の保存、アプリ内ログインウィンドウ、ブラウザからのインポート、期限切れの検出
src/main/bili               bilibili API：WBI 署名、動画 / アニメ / 講座 / リストの解析、ストリーム取得、字幕、弾幕
src/main/download           ダウンロードキュー、レジューム、ffmpeg による結合、追加コンテンツ（カバー、字幕、NFO…）
src/main/net                プロキシと CDN の選択
src/main/update             アプリ内アップデート：update.json の確認、ダウンロードの検証、.app または AppImage の置き換え
src/main/mcp                ローカル MCP サーバー
src/main/subscriptions.ts   購読
src/shared                  全プロセス共通の型、リンク解析、命名テンプレート
src/renderer                UI（React + Tailwind CSS + zustand）
scripts                     ffmpeg の取得、アイコン生成、リリース公開
```

## コントリビュート

Issue やプルリクエストを歓迎します。事前に [CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。

## 謝辞

- bilibili API のドキュメントをまとめた [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
- [FFmpeg](https://ffmpeg.org) と [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org)、[electron-vite](https://electron-vite.org)、[electron-builder](https://www.electron.build)
- [React](https://react.dev)、[Tailwind CSS](https://tailwindcss.com)、[zustand](https://github.com/pmndrs/zustand)、[Lucide](https://lucide.dev)

## ライセンス

[MIT](LICENSE) © wangzi6224

アプリには [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)（`b6.1.1`）の静的ビルドの FFmpeg が同梱されています。FFmpeg は独自のライセンスに従う独立したプログラムとして動作し、上記の MIT ライセンスの対象外です。ライセンス本文はアプリ内の `Contents/Resources/ffmpeg/LICENSE`（macOS）/ `resources/ffmpeg/LICENSE`（Linux） に含まれています。[FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html) も参照してください。
