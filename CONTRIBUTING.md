# Contributing

Thanks for your interest in Bili Downloader! Bug reports, feature ideas and pull requests are all welcome.

## Reporting bugs

Please [open an issue](https://github.com/wangzi6224/bili-downloader/issues) with:

- the app version (**设置 → 常规 → 更新**, Settings → General → Update) and your macOS version / chip (Apple Silicon or Intel)
- the link you tried to download, if it is public
- what you expected and what happened
- the relevant lines from the log: menu bar → **帮助 → 打开日志文件夹** (Help → Open log folder)

Please remove cookies, tokens and other personal information before posting logs.

## Development setup

Requirements:

- macOS (the app is macOS-only)
- Node.js 22.12 or later
- npm

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run fetch-ffmpeg   # optional: download the bundled static ffmpeg builds
npm run dev            # start in development mode; main-process changes restart the app
```

In development the app uses `resources/ffmpeg/<arch>/ffmpeg` (downloaded by `npm run fetch-ffmpeg`) and falls back to a Homebrew-installed ffmpeg if that is missing.

Development mode adds a **调试** (Debug) menu to the menu bar with **模拟登录过期 / 恢复真实登录** (simulate an expired login / restore the real login), which is handy for testing the re-login flow.

## Before opening a pull request

```bash
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript
```

Both must pass. Please also:

- keep changes focused: one feature or fix per pull request
- add or update tests for logic in `src/main` and `src/shared`
- follow the existing code style; code comments and UI text are written in Simplified Chinese
- use short commit messages in the existing style, e.g. `feat: …`, `fix: …`, `docs: …`, `chore: …`
- add a line under the unreleased section of `CHANGELOG.md` for user-facing changes

If you change the README, please keep all translations (`README.*.md`) structurally in sync, or mention in the pull request which ones still need updating.

## Project layout

See the **Project structure** section of the [README](README.md).

## Building and releasing

Packaging, icon generation, the in-app update mechanism and the release process are documented (in Chinese) in [docs/RELEASING.md](docs/RELEASING.md).
