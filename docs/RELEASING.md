# 打包与发布

维护者文档：打包安装包、重新生成图标、发布新版本、在本地测试应用内更新。日常开发见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 打包

mac、Linux 和 Windows 包分别在对应系统上打：

```bash
npm run build:mac     # macOS：x64 和 arm64 的 dmg、zip
npm run build:linux   # Linux：x64 的 AppImage 和 deb
npm run build:win     # Windows：x64 的 NSIS 安装器 exe
```

都会先跑类型检查和单元测试（`npm run verify`），任何一项失败，或者覆盖率低于 `vitest.config.mts` 里的门槛，都会直接停下、不打包；通过后下载当前系统用的静态 ffmpeg（固定 sha256 校验，放在 `resources/ffmpeg/<系统>-<架构>/`），再在 `dist/` 里生成安装包。

- **macOS**：`x64` 和 `arm64` 各一个 dmg 和 zip。打开 dmg 后把应用图标拖到“应用程序”即可安装。应用使用 ad-hoc 签名、没有公证，第一次打开会被拦截，需要到“系统设置 → 隐私与安全性”里点“仍要打开”（macOS 15 起右键 →“打开”已不再有效）。
- **Linux**：`bili-downloader-<版本>-x86_64.AppImage` 和 `bili-downloader-<版本>-amd64.deb`（文件名里的架构名是 electron-builder 起的）。AppImage 加上可执行权限就能运行；deb 用 `sudo apt install ./bili-downloader-<版本>-amd64.deb` 安装，装到 `/opt/B站下载器/`，应用菜单里会出现“B站下载器”。Ubuntu 24.04 起限制了非特权用户命名空间，AppImage 的启动脚本检测到后会自动加 `--no-sandbox`，deb 包自带 AppArmor 配置，都不需要额外处理。
- **Windows**：`bili-downloader-<版本>-x64.exe` 是 NSIS 当前用户安装器，不需要管理员权限。尚未配置代码签名证书，首次运行时 Windows 可能提示发布者未知。

应用图标的源文件是 `build/icon.svg`，dmg 安装窗口背景的源文件是 `build/dmg-background.svg`，改完后运行 `npm run icons` 重新生成 `build/icon.ico`、`build/icon.icns`、`build/icon.png`、`build/icons/` 和 `build/background{,@2x}.png`（生成物已提交，平时打包不需要这一步）。Windows ICO、PNG 可在各系统生成；icns 和 dmg 背景要用 macOS 的 iconutil 和冬青黑体，只能在 macOS 上生成。背景里图标的位置要和 `electron-builder.yml` 里 `dmg.contents` 的坐标一致。

## 应用内更新的工作方式

新版本发布在本仓库的 GitHub Releases 里（仓库需要是公开的，应用不带令牌访问）。应用启动时、以及后台运行期间每天读取 `releases/latest/download/update.json`，发现新版本就弹出更新说明，用户可以跳过这个版本、以后再说，或者下载安装。

`update.json` 的 `files` 里每个能自动更新的安装包一项：macOS 的键只写架构（`arm64`、`x64`，已发布的旧版本就是按 `process.arch` 取的，不能改），Linux 和 Windows 的键带上系统名（`linux-x64`、`win32-x64`）。旧版本遇到不认识的键会忽略。

- **macOS**：下载当前架构的 zip，按 sha512 校验后解压，确认是本应用的对应版本，退出时由一个独立脚本替换 `.app` 并重新打开；替换失败会恢复旧版本。应用没有开发者证书，electron-updater（Squirrel.Mac）要求正式签名，所以没有用它。应用不在可写的位置时（直接从 dmg 或“下载”文件夹里打开、没有 `/Applications` 写权限）不能自动安装，弹窗里会改为“前往下载页面”。
- **Linux**：只有 AppImage 版能自动安装（AppImage 运行时会设置 `APPIMAGE` 环境变量，指向正在运行的文件）。下载新的 AppImage、按 sha512 校验后复制到原文件旁边，退出时由一个独立脚本覆盖原文件（路径不变，用户建的启动器照样能用）并重新打开；替换失败会保留旧版本。deb 安装的、或者 AppImage 所在目录不可写时，弹窗里会改为“前往下载页面”。
- **Windows**：下载并校验 NSIS `.exe`，应用退出后由 PowerShell 结束残留的 ffmpeg、静默安装（`/S --updated`），再重新打开应用；不是从安装器装好的位置运行（旁边没有卸载程序），或者安装目录不可写时，弹窗里会改为“前往下载页面”。

替换日志都在数据文件夹的 `logs/update.log`。

## 发布新版本

发布由 GitHub Actions 完成（[`.github/workflows/release.yml`](../.github/workflows/release.yml)）：推送 `v版本号` 的 tag 后，先检查版本，再分别在 macOS、Linux 和 Windows runner 上跑类型检查和单元测试（含覆盖率门槛）并打包，最后汇总所有安装包，生成 `update.json`，创建 Release 并上传 zip、dmg、AppImage、deb、exe 和 `update.json`，整个过程不需要本机参与。

1. 改版本号：`npm version 0.5.0 --no-git-tag-version`（同时改 `package.json` 和 `package-lock.json`）
2. 在 `CHANGELOG.md` 里把“未发布”改成 `## 新版本号 - 日期`，这段会显示在应用的更新弹窗和 Release 页面上
3. 提交、推送，再打 tag 推送：

   ```bash
   git commit -am "chore: 发布 0.5.0" && git push
   git tag v0.5.0 && git push origin v0.5.0
   ```

4. 在仓库的 Actions 页面看进度，完成后 Release 页面就有新版本了

工作流第一步会检查 tag 和 `package.json` 的版本是否一致、`CHANGELOG.md` 里有没有这个版本、这个版本是不是已经发布过，不对就直接失败，不会打包。tag 打错了先删掉（`git push origin :refs/tags/v0.5.0 && git tag -d v0.5.0`），改好再重新打。网络之类的偶发失败在 Actions 页面点 “Re-run jobs” 即可。

带后缀的版本号（如 `1.0.0-beta.1`）会发布成预发布版本，已安装的正式版不会收到。

改了打包相关的配置，想先确认能打出包：在 Actions 页面手动运行“发布”工作流（Run workflow），它只打包不发布，三个系统的全部安装包和 `update.json` 作为这次运行的产物上传，保留 7 天。Windows 包打好后还会在 runner 上静默安装一遍，确认安装目录里有卸载程序、装进去的 ffmpeg 和应用都能启动。

用 AI 编程助手发布时，直接说“发布新版本”即可：项目里的 `release` skill 写了上面整套步骤，推送 tag 前会先请你确认。它放在 `.agents/skills/release/`（Codex 和 GitHub Copilot 读这里），`.claude/skills/release` 是指向它的软链接（Claude Code 读这里），改流程时只改 `.agents/skills/release/SKILL.md` 一处。

Actions 不可用时，也可以在本机（macOS）发布：先在 Linux 上运行 `npm run build:linux`、在 Windows 上运行 `npm run build:win`，把生成的包拷到 mac 的 `dist/` 里，再在 mac 上提交并推送后运行 `npm run release`。它会先做同样的检查，再打 mac 包，用 `gh` 创建 `v版本号` 的 Release（tag 不存在会自动创建）并上传；`dist/` 里缺任何一个安装包都会停下。

## 在本地测试更新流程

用旧版本号打包一份运行，再用新版本号打包（不想改 `package.json` 时可以给 electron-builder 加 `-c.extraMetadata.version=新版本号`）。`node scripts/release.mjs --dry-run` 只生成 `dist/update.json` 不上传（它要求两个系统的安装包都在 `dist/` 里，只测一个系统时照着 `scripts/lib/release.mjs` 手写一份也行）；把其中的下载地址改成本机地址后，在 `dist/` 里起一个静态服务器，用 `BILI_UPDATE_FEED=http://127.0.0.1:端口/update.json` 启动旧版本。这个环境变量只放行本机的 http 地址。

- macOS：直接运行 `.app/Contents/MacOS/` 里的可执行文件
- Linux：把旧版本的 AppImage 复制到一个可写的目录里运行；不想动自己的数据，可以同时设置 `XDG_CONFIG_HOME` 指到一个临时目录（自动重启的新版本会沿用这个环境变量）
