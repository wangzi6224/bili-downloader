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

会先下载两个架构的静态 ffmpeg（固定 sha256 校验），再在 `dist/` 里分别生成 `x64` 和 `arm64` 的 dmg 和 zip。应用使用 ad-hoc 签名、没有公证，第一次打开需要在“访达”里右键 →“打开”。

应用图标的源文件是 `build/icon.svg`，改完后运行 `npm run icons` 重新生成 `build/icon.icns` 和 `build/icon.png`（生成物已提交，平时打包不需要这一步）。

## 关于浏览器导入

Chrome、Edge、Brave 的数据目录受 macOS 隐私保护。要从这些浏览器导入，需要在“系统设置 → 隐私与安全性 → 完全磁盘访问权限”里打开本应用并重启应用；导入 Chrome 系浏览器时还会弹出钥匙串授权。如果不想授权，可以直接用应用内登录。

退出登录只清除应用自己的 cookie，不会调用 B站的退出接口，所以不会把浏览器里的登录也一起退出。

## 目录

```
src/main/auth       登录：cookie 存储、应用内登录窗口、浏览器导入、过期检测
src/main/bili       B站接口：WBI 签名、视频/番剧解析、取流、字幕、弹幕
src/main/download   下载队列、断点续传、ffmpeg 合并、附加内容
src/shared          三端共用的类型和链接识别
src/renderer        界面（React + Tailwind + zustand）
scripts             打包前下载 ffmpeg
```
