# B站下载器

粘贴 B站链接即可下载视频、分P、合集、番剧和电影的 macOS 桌面应用（Electron，支持 Intel 和 Apple 芯片）。

## 功能

- 识别普通视频（BV / av）、分P、合集、番剧和电影（ep / ss / md），以及 b23.tv 短链和带标题的分享文案
- 合集、分P、剧集按分组勾选，支持全选、反选、Shift 连选
- 清晰度列表来自接口（8K / 杜比视界 / HDR / 4K / 1080P60 …），标出需要大会员的档位；编码偏好可选 AVC / HEVC / AV1
- 登录：从 Chrome / Edge / Brave / Arc / Vivaldi / Chromium / Firefox 导入 cookie，或在应用内打开 B站官方登录页（扫码 / 密码 / 短信）
- 启动、切回窗口、解析链接、接口返回 -101 时检测登录状态，过期后自动弹出登录对话框；下载队列暂停取流，重新登录后自动继续
- 下载队列：并发数可调，支持暂停、继续、断点续传（重启后仍可续传），合并用 ffmpeg 直接复制流，不重新编码
- 附加内容：封面、CC 字幕（.srt）、弹幕（.ass）、仅音频（m4a / 无损 flac）
- 下载期间可以阻止系统睡眠或保持屏幕常亮，队列空闲后自动恢复

不支持：带 DRM 加密的片源、地区限制的内容，以及账号没有权限观看的内容（应用会把这些任务标为“无法下载”并写明原因）。仅供下载你本人账号有权观看的内容，用于个人用途。

## 开发

```bash
npm install
npm run dev        # 开发模式，主进程改动会自动重启
npm test           # 单元测试
npm run typecheck
```

开发时用 `resources/ffmpeg/<arch>/ffmpeg`，找不到时退回 Homebrew 安装的 ffmpeg。开发模式下菜单栏有“调试 → 模拟登录过期 / 恢复真实登录”。

## 打包

```bash
npm run build:mac
```

会先下载两个架构的静态 ffmpeg（固定 sha256 校验），再在 `dist/` 里分别生成 `x64` 和 `arm64` 的 dmg 和 zip。打开 dmg 后把应用图标拖到“应用程序”即可安装。应用使用 ad-hoc 签名、没有公证，第一次打开会被拦截，需要到“系统设置 → 隐私与安全性”里点“仍要打开”（macOS 15 起右键 →“打开”已不再有效）。

应用图标的源文件是 `build/icon.svg`，dmg 安装窗口背景的源文件是 `build/dmg-background.svg`，改完后运行 `npm run icons` 重新生成 `build/icon.icns`、`build/icon.png` 和 `build/background{,@2x}.png`（生成物已提交，平时打包不需要这一步）。背景里图标的位置要和 `electron-builder.yml` 里 `dmg.contents` 的坐标一致。

## 发布新版本

新版本发布在本仓库的 GitHub Releases 里（仓库需要是公开的，应用不带令牌访问）。应用启动时、以及后台运行期间每天读取 `releases/latest/download/update.json`，发现新版本就弹出更新说明，用户可以跳过这个版本、以后再说，或者下载安装。下载的是当前架构的 zip，按 sha512 校验后解压，确认是本应用的对应版本，退出时由一个独立脚本替换 `.app` 并重新打开；替换失败会恢复旧版本，日志在 `logs/update.log`。应用没有开发者证书，electron-updater（Squirrel.Mac）要求正式签名，所以没有用它。

应用不在可写的位置时（直接从 dmg 或“下载”文件夹里打开、没有 `/Applications` 写权限）不能自动安装，弹窗里会改为“前往下载页面”。

发布步骤：

1. 改 `package.json` 里的 `version`
2. 在 `CHANGELOG.md` 里把“未发布”改成 `## 新版本号 - 日期`，这段会显示在应用的更新弹窗和 Release 页面上
3. 提交并 `git push`
4. 运行 `npm run release`：打包两个架构，生成 `dist/update.json`，用 `gh` 创建 `v版本号` 的 Release 并上传 zip、dmg 和 `update.json`

带后缀的版本号（如 `1.0.0-beta.1`）会发布成预发布版本，已安装的正式版不会收到。

在本地测试更新流程：用旧版本号打包一份运行，再用新版本号打包，`node scripts/release.mjs --dry-run` 只生成 `dist/update.json` 不上传；把其中的下载地址改成本机地址后，在 `dist/` 里起一个静态服务器，用 `BILI_UPDATE_FEED=http://127.0.0.1:端口/update.json` 启动旧版本（直接运行 `.app/Contents/MacOS/` 里的可执行文件）。这个环境变量只放行本机的 http 地址。

## 关于浏览器导入

Chrome、Edge、Brave 的数据目录受 macOS 隐私保护。要从这些浏览器导入，需要在“系统设置 → 隐私与安全性 → 完全磁盘访问权限”里打开本应用并重启应用；导入 Chrome 系浏览器时还会弹出钥匙串授权。如果不想授权，可以直接用应用内登录。

退出登录只清除应用自己的 cookie，不会调用 B站的退出接口，所以不会把浏览器里的登录也一起退出。

## 目录

```
src/main/auth       登录：cookie 存储、应用内登录窗口、浏览器导入、过期检测
src/main/bili       B站接口：WBI 签名、视频/番剧解析、取流、字幕、弹幕
src/main/download   下载队列、断点续传、ffmpeg 合并、附加内容
src/main/update     应用内更新：检查 update.json、下载校验、替换 .app
src/shared          三端共用的类型和链接识别
src/renderer        界面（React + Tailwind + zustand）
scripts             打包前下载 ffmpeg、生成图标、发布新版本
```
