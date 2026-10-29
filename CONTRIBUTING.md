# Contributing

Thanks for your interest in Bili Downloader! Bug reports, feature ideas and pull requests are all welcome.

## Reporting bugs

Please [open an issue](https://github.com/wangzi6224/bili-downloader/issues) with:

- the app version (**设置 → 常规 → 更新**, Settings → General → Update) and your system: macOS version and chip (Apple Silicon or Intel), or Linux distribution and whether you use the AppImage or the deb
- the link you tried to download, if it is public
- what you expected and what happened
- the relevant lines from the log: menu bar → **帮助 → 打开日志文件夹** (Help → Open log folder; on Linux press Alt to show the menu bar)

Please remove cookies, tokens and other personal information before posting logs.

## Development setup

Requirements:

- macOS or Linux (the app is built for both; packaging for a system has to be done on that system)
- Node.js 22.12 or later
- npm

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run fetch-ffmpeg   # optional: download the bundled static ffmpeg builds
npm run dev            # start in development mode; main-process changes restart the app
```

In development the app prefers a Homebrew-installed ffmpeg on macOS, then `resources/ffmpeg/<platform>-<arch>/ffmpeg` (downloaded by `npm run fetch-ffmpeg` for the current system, e.g. `darwin-arm64` or `linux-x64`), then whatever `ffmpeg` is on your `PATH`. Older checkouts kept the binaries in `resources/ffmpeg/<arch>/`; run `npm run fetch-ffmpeg` again after updating.

Development mode adds a **调试** (Debug) menu to the menu bar with **模拟登录过期 / 恢复真实登录** (simulate an expired login / restore the real login), which is handy for testing the re-login flow.

## Before opening a pull request

```bash
npm run verify       # TypeScript + unit tests (Vitest) with coverage thresholds
```

It must pass: `npm run build`, `npm run build:mac` and `npm run build:linux` run the same check first and refuse to build when it fails. Some tests only run on one system (for example the macOS `.app` unpacking uses `ditto`), so CI runs the suite on both. `npm test` runs the tests alone without coverage, which is quicker while you work. Please also:

- keep changes focused: one feature or fix per pull request
- add or update tests for any logic you add or change; renderer logic goes in `src/renderer/src/*.ts` (not in components) so it can be tested in Node. The coverage report is written to `coverage/index.html`
- UI text that differs between macOS and Linux (Finder / file manager, ⌘ / Ctrl, Dock / tray) goes in `src/renderer/src/platform.ts`
- follow the existing code style; code comments and UI text are written in Simplified Chinese
- use short commit messages in the existing style, e.g. `feat: …`, `fix: …`, `docs: …`, `chore: …`
- add a line under the unreleased section of `CHANGELOG.md` for user-facing changes

If you change the README, please keep all translations (`README.*.md`) structurally in sync, or mention in the pull request which ones still need updating.

## Project layout

See the **Project structure** section of the [README](README.md).

## Building and releasing

Packaging, icon generation, the in-app update mechanism and the release process are documented (in Chinese) in [docs/RELEASING.md](docs/RELEASING.md).
