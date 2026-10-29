<div align="center">

<img src="build/icon.png" width="128" alt="Bili Downloader icon">

# Bili Downloader

A macOS desktop app for downloading from bilibili: paste a link to get videos, multi-part videos, collections, anime and movies.

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
![macOS 12+](https://img.shields.io/badge/macOS-12%2B-black?logo=apple)
![Apple Silicon | Intel](https://img.shields.io/badge/arch-Apple%20Silicon%20%7C%20Intel-blue)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="Download queue">
  <img src="docs/screenshots/select.png" width="49%" alt="Choosing episodes, quality and extras">
</p>

> [!NOTE]
> This is an unofficial project and is not affiliated with or endorsed by bilibili. Only download content your own account is allowed to watch, for personal use, and respect the rights of creators and bilibili's terms of service.

## Features

### Supported links

- Videos (BV / av), multi-part videos, collections, anime and movies (ep / ss / md), and paid courses
- Favorites folders, Watch Later, an uploader's videos, collections and series (with keyword filtering)
- Audio tracks and audio playlists (au / am), Weekly Must-Watch, and the popularity rankings by category
- Short links (b23.tv and others) and share text that has the title mixed in with the link
- Parse several links at once, and load paged lists (favorites, uploader pages) page by page

### Quality and formats

- The quality list comes from the API (8K / Dolby Vision / HDR / 4K / 1080P60 / …), with premium-only (大会员) tiers marked
- Codec priority AVC / HEVC / AV1, with audio up to Dolby Atmos and Hi-Res lossless FLAC
- Full video, audio only, or video only; MP4 or MKV
- ffmpeg copies the streams straight into the output file, with no re-encoding

### Extras

- Cover: save it as an image and/or embed it in the file
- CC subtitles: save them as `.srt` and/or embed them in the video
- Danmaku (bullet comments) as `.ass` and/or `.xml`, with adjustable font size, opacity and duration
- The chapter markers on bilibili's progress bar, written as real chapters
- NFO metadata for Kodi / Jellyfin media libraries

### Queue and network

- Adjustable concurrency, multi-threaded segmented downloads, speed limit, automatic retry on network errors
- Pause, resume, and resume after a restart; clear notes for tasks that cannot be downloaded
- Proxy: direct, system, or manual; pick the fastest bilibili CDN node with a built-in latency test
- Optionally keep the Mac (or the display) awake while downloading, and send a notification when the queue finishes

### Organizing and automation

- Naming templates with variables (`{title}`, `{series}`, `{index:03}`, `{pubdate:YYYY-MM-DD}`, …), optional segments and folder levels, set separately for single videos, collections and anime
- Spots items you have already downloaded, and asks / skips / downloads again
- Subscriptions: check favorites, collections or uploaders on a schedule and download new items automatically
- Parse history, clipboard watching, light / dark theme, run in the background, import / export settings
- In-app updates from GitHub Releases, with release notes and an option to skip a version

### AI integration

- A local [MCP](https://modelcontextprotocol.io) server lets AI clients such as Claude parse links, queue downloads and check progress (see **MCP server** below)

## Installation

1. Download the latest `.dmg` from [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest):
   - Apple Silicon (M1 and later): `bili-downloader-<version>-arm64.dmg`
   - Intel: `bili-downloader-<version>-x64.dmg`
2. Open the dmg and drag **B站下载器** into **Applications**.
3. The app is ad-hoc signed but not notarized, so macOS blocks it the first time. Try to open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**. (Since macOS 15, right-click → Open no longer works.) Alternatively, run:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

Requires macOS 12 or later. The interface is currently available in Simplified Chinese only; the labels mentioned below are given in Chinese with an English translation.

Once installed, the app checks for updates itself and can install them in place.

## Quick start

1. Sign in to your bilibili account (see **Signing in** below). The app needs an account to parse links.
2. Copy a bilibili link. The app picks it up from the clipboard when you switch back to it, or press <kbd>⌘</kbd><kbd>V</kbd> in the input box and click **解析** (Parse).
3. Choose the items to download. Select all, invert the selection, <kbd>Shift</kbd>-click to select a range, or filter by title or by index (e.g. `1-5,7`).
4. Pick the quality, output type and extras, then click **下载** (Download).

You can also type these keywords instead of a link: `稍后再看` or `watchlater` (Watch Later), `每周必看` (Weekly Must-Watch), `排行榜` (rankings).

## Signing in

Logging in gives you the qualities and content your own account has access to (1080P and above, premium content). There are three ways to do it:

- **从浏览器导入** (Import from browser): reuse the login cookies from Chrome, Edge, Brave, Arc, Vivaldi, Chromium or Firefox. macOS protects the data of Chrome, Edge and Brave, so first enable the app under **System Settings → Privacy & Security → Full Disk Access** and restart it. Importing from Chromium-based browsers also asks for Keychain access.
- **在应用内登录** (Sign in within the app): opens bilibili's official login page, supporting QR code, password and SMS login.
- **手动粘贴 Cookie** (Paste cookies): a semicolon-separated cookie string, or the JSON exported by a browser extension.

The app checks the login state on launch, when you return to the window, while parsing, and whenever the API reports an expired session. If the login has expired, it asks you to sign in again, pauses fetching new streams, and resumes the queue once you are back. Signing out only clears the app's own cookies. It does not sign you out of your browser.

## MCP server

The app can run a local [Model Context Protocol](https://modelcontextprotocol.io) server so that AI clients can work with your download queue.

1. Go to **设置 → 网络与高级 → MCP 服务** (Settings → Network & Advanced → MCP server) and turn it on.
2. Use the buttons in the same section to copy the client configuration (JSON) or the Claude Code command, which already include your access token.

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

| Tool | Description |
| --- | --- |
| `get_status` | Login and premium (大会员) status, queue summary, free space in the download folder, and anything that needs attention. Call it first |
| `parse_link` | Parse a bilibili link (video, collection, anime, course, favorites, uploader…); lists are paged through automatically. Item ids are stable; results can be read in pages and multi-part videos expanded |
| `download_batch` | Queue a whole link or selected items as one batch and return a `batch_id`. Already-downloaded items are skipped by default, and resubmitting does not download anything twice |
| `get_batch_status` | Batch progress: counts per status, speed, estimated time left, actual quality, failure reasons. `wait_seconds` waits for changes |
| `list_batches` | Recently submitted batches |
| `list_tasks` | List tasks page by page, filtered by batch, status or title |
| `control_tasks` | Pause, resume, retry, redownload or remove tasks in bulk (downloaded files are never deleted) |
| `get_settings` / `update_settings` | Read or change the download folder, concurrency, threads, speed limit, auto-retry, default quality and download options |

The server listens only on `127.0.0.1` (the port is configurable), requires the Bearer token, and checks the `Host` / `Origin` headers to prevent DNS rebinding. You can regenerate the token at any time.

## Limitations

- DRM-protected content, region-locked content, and content your account is not allowed to watch cannot be downloaded. Those tasks are marked as **无法下载** (cannot be downloaded) with the reason.
- macOS only.

## Building from source

Requires macOS, Node.js 22.12 or later, and npm.

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run dev          # development mode
npm test             # unit tests
npm run typecheck    # type check
npm run build:mac    # build x64 and arm64 dmg / zip into dist/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [docs/RELEASING.md](docs/RELEASING.md) (in Chinese) for packaging and releases.

## Project structure

```
src/main/auth               Sign-in: cookie storage, in-app login window, browser import, expiry detection
src/main/bili               bilibili APIs: WBI signing, video / anime / course / list parsing, streams, subtitles, danmaku
src/main/download           Download queue, resumable downloads, ffmpeg muxing, extras (cover, subtitles, NFO…)
src/main/net                Proxy and CDN selection
src/main/update             In-app updates: check update.json, verify the download, replace the .app
src/main/mcp                Local MCP server
src/main/subscriptions.ts   Subscriptions
src/shared                  Types, link parsing and naming templates shared by all processes
src/renderer                User interface (React + Tailwind CSS + zustand)
scripts                     Fetch ffmpeg, generate icons, publish releases
```

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## Acknowledgements

- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) for its documentation of the bilibili APIs
- [FFmpeg](https://ffmpeg.org) and [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [electron-builder](https://www.electron.build)
- [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [zustand](https://github.com/pmndrs/zustand), [Lucide](https://lucide.dev)

## License

[MIT](LICENSE) © wangzi6224

The app bundles static FFmpeg binaries from [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) (`b6.1.1`). FFmpeg runs as a separate program under its own license and is not covered by the MIT license above. Its license text ships inside the app at `Contents/Resources/ffmpeg/LICENSE`; see also [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html).
