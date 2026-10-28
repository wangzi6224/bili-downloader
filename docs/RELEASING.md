# 打包与发布

维护者文档：打包安装包、重新生成图标、发布新版本、在本地测试应用内更新。日常开发见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 打包

```bash
npm run build:mac
```

会先下载两个架构的静态 ffmpeg（固定 sha256 校验），再在 `dist/` 里分别生成 `x64` 和 `arm64` 的 dmg 和 zip。打开 dmg 后把应用图标拖到“应用程序”即可安装。应用使用 ad-hoc 签名、没有公证，第一次打开会被拦截，需要到“系统设置 → 隐私与安全性”里点“仍要打开”（macOS 15 起右键 →“打开”已不再有效）。

应用图标的源文件是 `build/icon.svg`，dmg 安装窗口背景的源文件是 `build/dmg-background.svg`，改完后运行 `npm run icons` 重新生成 `build/icon.icns`、`build/icon.png` 和 `build/background{,@2x}.png`（生成物已提交，平时打包不需要这一步）。背景里图标的位置要和 `electron-builder.yml` 里 `dmg.contents` 的坐标一致。

## 应用内更新的工作方式

新版本发布在本仓库的 GitHub Releases 里（仓库需要是公开的，应用不带令牌访问）。应用启动时、以及后台运行期间每天读取 `releases/latest/download/update.json`，发现新版本就弹出更新说明，用户可以跳过这个版本、以后再说，或者下载安装。下载的是当前架构的 zip，按 sha512 校验后解压，确认是本应用的对应版本，退出时由一个独立脚本替换 `.app` 并重新打开；替换失败会恢复旧版本，日志在 `logs/update.log`。应用没有开发者证书，electron-updater（Squirrel.Mac）要求正式签名，所以没有用它。

应用不在可写的位置时（直接从 dmg 或“下载”文件夹里打开、没有 `/Applications` 写权限）不能自动安装，弹窗里会改为“前往下载页面”。

## 发布新版本

1. 改 `package.json` 里的 `version`
2. 在 `CHANGELOG.md` 里把“未发布”改成 `## 新版本号 - 日期`，这段会显示在应用的更新弹窗和 Release 页面上
3. 提交并 `git push`
4. 运行 `npm run release`：打包两个架构，生成 `dist/update.json`，用 `gh` 创建 `v版本号` 的 Release 并上传 zip、dmg 和 `update.json`

带后缀的版本号（如 `1.0.0-beta.1`）会发布成预发布版本，已安装的正式版不会收到。

## 在本地测试更新流程

用旧版本号打包一份运行，再用新版本号打包，`node scripts/release.mjs --dry-run` 只生成 `dist/update.json` 不上传；把其中的下载地址改成本机地址后，在 `dist/` 里起一个静态服务器，用 `BILI_UPDATE_FEED=http://127.0.0.1:端口/update.json` 启动旧版本（直接运行 `.app/Contents/MacOS/` 里的可执行文件）。这个环境变量只放行本机的 http 地址。
