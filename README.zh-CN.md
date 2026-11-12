<div align="center">

<img src="build/icon.png" width="128" alt="B站下载器图标">

# B站下载器

**喜欢的 B站内容，存进自己的硬盘。** 复制链接、粘贴、下载：视频、合集、番剧、课程一把带走，最高 8K / 杜比视界，字幕、弹幕、章节也能一起存。顺手 AI 去个水印，或者干脆让 AI Agent 替你跑腿。免费开源，Windows、macOS、Linux 都能用。

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
[![Stars](https://img.shields.io/github/stars/wangzi6224/bili-downloader?style=flat)](https://github.com/wangzi6224/bili-downloader/stargazers)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

[![下载 macOS 版](https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![下载 Windows 版](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![下载 Linux 版](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/wangzi6224/bili-downloader/releases/latest)

**[官网](https://wangzi6224.github.io/bili-downloader/zh/)** · **[下载](https://github.com/wangzi6224/bili-downloader/releases/latest)** · **[四步开下](#四步开下)** · **[让 AI 帮你下](#让-ai-帮你下mcp)** · **[常见问题](#常见问题)**

[English](README.md) | **简体中文** | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

## 先看效果

**AI 去水印前后对比**：左边是刚下下来的原片，右边是 AI 精修之后。

https://github.com/user-attachments/assets/835dda86-4575-4311-808b-507c04bbd589

<sub>素材来源：哔哩哔哩 UP 主「陈翔六点半」作品《陈翔六点半：一念贪虚妄，半生困赌局》，原视频地址：[https://www.bilibili.com/video/BV1vU446BEiU](https://www.bilibili.com/video/BV1vU446BEiU)。版权归原作者所有，欢迎前往观看正版。<br>本片段仅用于演示软件功能，仅供个人学习交流，禁止传播。如有侵权，请通过 [Issues](https://github.com/wangzi6224/bili-downloader/issues) 与我们联系，我们将及时删除。</sub>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="下载队列">
  <img src="docs/screenshots/select.png" width="49%" alt="选择剧集、清晰度和附加内容">
</p>

## 它能帮你做什么

| | |
| --- | --- |
| **画质拉满** <br> 8K、杜比视界、HDR，账号能看什么就能下什么。AVC / HEVC / AV1 随你挑，音轨最高杜比全景声和 Hi-Res 无损 FLAC，默认原样封装、不重新编码。 | **丢个链接就行** <br> 单个视频、分P、合集、番剧、电影、课程、收藏夹、稍后再看、UP 主投稿、音频、排行榜……整个列表一次解析，b23.tv 短链和分享文案也认。 |
| **AI 去水印** <br> 角落水印自动识别，也能自己框；打开“AI 精修”，逐帧把水印下面的画面补回来。 | **字幕弹幕全都要** <br> CC 字幕存成 `.srt` 或直接写进视频，弹幕存成 `.ass` / `.xml`，还有章节、封面，以及给 Kodi / Jellyfin 用的 NFO。 |
| **挂着就能下完** <br> 断点续传、多线程分段、限速、自动重试、命名模板；订阅喜欢的 UP 主、收藏夹或合集，有新投稿自动下。 | **让 AI 替你下** <br> 内置本地 MCP 服务，Claude 等 AI 客户端可以帮你搜视频、解析链接、排队下载、去水印、盯进度。 |

> [!NOTE]
> 本项目是非官方工具，与哔哩哔哩无关，也未获其认可。请只下载你本人账号有权观看的内容，仅用于个人用途，并尊重创作者的权益和 B站的用户协议。

## 四步开下

1. **下载**：从 [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) 下载对应系统的安装包：

   | 系统 | 文件 |
   | --- | --- |
   | macOS，Apple 芯片（M1 及以后） | `bili-downloader-<version>-arm64.dmg` |
   | macOS，Intel 芯片 | `bili-downloader-<version>-x64.dmg` |
   | Windows x64 | `bili-downloader-<version>-x64.exe` |
   | Linux x64 | `bili-downloader-<version>-x86_64.AppImage` 或 `bili-downloader-<version>-amd64.deb` |

2. **登录** B站账号（见下文 [登录与隐私](#登录与隐私)）。应用要登录后才能解析链接。
3. **粘贴链接**：切回应用时会自动识别剪贴板，也可以在输入框里按 <kbd>⌘</kbd><kbd>V</kbd>（Windows 和 Linux 上为 <kbd>Ctrl</kbd><kbd>V</kbd>）粘贴后点 **解析**。
4. **选择并下载**：勾选要下载的条目（支持全选、反选、<kbd>Shift</kbd> 连选，以及按标题或序号如 `1-5,7` 筛选），选好清晰度、下载内容和附加内容，点 **下载**。

也可以直接输入这些关键词代替链接：`稍后再看` 或 `watchlater`、`每周必看`、`排行榜`。

## 安装

### macOS

1. 从 [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) 下载最新的 `.dmg`：Apple 芯片选 `arm64`，Intel 芯片选 `x64`。
2. 打开 dmg，把 **B站下载器** 拖到 **应用程序**。
3. 应用使用 ad-hoc 签名、没有公证，第一次打开会被 macOS 拦截。先尝试打开一次，再到 **系统设置 → 隐私与安全性** 里点 **仍要打开**（macOS 15 起右键 →“打开”已不再有效）。也可以在终端运行：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

需要 macOS 12 或更高版本。

### Windows

从 [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest) 下载 `bili-downloader-<version>-x64.exe` 并运行安装器。安装在当前用户下，无需管理员权限。安装器尚未签名，Windows 可能提示发布者未知。

### Linux

<details>
<summary>AppImage 或 deb（仅支持 64 位 x86）</summary>

- **AppImage**（各发行版通用，可自动更新）：`bili-downloader-<version>-x86_64.AppImage`。添加可执行权限后运行：

  ```bash
  chmod +x bili-downloader-*-x86_64.AppImage
  ./bili-downloader-*-x86_64.AppImage
  ```

  AppImage 依赖 FUSE 2。如果无法启动，请先安装它（Ubuntu 24.04 及以后用 `sudo apt install libfuse2t64`，更早的版本用 `libfuse2`），或者加上 `--appimage-extract-and-run` 参数运行。
- **deb**（Debian、Ubuntu 及其衍生发行版）：`bili-downloader-<version>-amd64.deb`。用 `sudo apt install ./bili-downloader-<version>-amd64.deb` 安装，之后 **B站下载器** 会出现在应用菜单里。

关闭窗口转入后台运行后，点击托盘图标即可重新打开。GNOME 桌面需要 AppIndicator 扩展才能显示托盘图标（Ubuntu 默认已自带）。菜单栏默认隐藏，按 <kbd>Alt</kbd> 键显示。

</details>

### 更新

安装后应用会自动检查更新。macOS 版、Windows 安装器和 Linux 的 AppImage 版可以直接下载安装新版本；deb 版会显示更新说明，并引导你前往下载页面。

## AI 去水印

视频角落挂着 UP 主水印，看着碍眼？两种去法任你选：

| 模式 | 原理 | 适合 |
| --- | --- | --- |
| **快速**（默认） | 识别角落的水印，用 ffmpeg 的 `delogo` 按周围像素填补 | 要快、背景比较静止 |
| **AI 精修** | 用 [LaMa](https://github.com/advimman/lama) 修补模型逐帧补出水印下面的画面 | 效果干净得多，画面运动多 |

- 在下载选项里开启，或者用下载列表上方的 **下载后去水印** 开关，随时切换。
- 已经下载好的视频，可以手动框选水印位置再去除。
- AI 精修开始前会给出预计耗时，有显卡时用显卡加速。模型约 200 MB，不随安装包分发，第一次使用时下载并校验 SHA-256。
- 去水印会重新编码视频；HDR 和杜比视界视频不处理。

## 让 AI 帮你下（MCP）

打开应用里的本地 [Model Context Protocol](https://modelcontextprotocol.io) 服务，Claude 等 AI 客户端就能替你搜视频、排队下载、盯进度。配好之后，跟 AI 说一句话就行，比如：

> 在 B站搜索时长 30～60 分钟的“Blender 教程”，挑播放量最高的 5 个，作为一个批次下载。

Agent 会先用 `search_videos` 找到候选视频，再用 `download_batch` 把这 5 个视频作为一个批次加入下载，最后用 `get_batch_status` 跟踪进度直到完成。

> 把这个合集里我还没下载的视频都下载下来，下完用 AI 精修去水印：https://space.bilibili.com/…

这里 Agent 会用 `parse_link` 展开合集，用 `download_batch` 加入下载（已下载的自动跳过），用 `get_batch_status` 查看哪些文件有水印、去水印要多久，再用 `remove_watermark` 去除。

### 怎么配置

1. 在 **设置 → 网络与高级 → MCP 服务** 里打开 **开启 MCP 服务**。
2. 用同一区域的按钮复制客户端配置（JSON）或 Claude Code 命令，里面已经带好访问令牌。

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

<details>
<summary>全部 MCP 工具</summary>

| 工具 | 说明 |
| --- | --- |
| `list_accounts` / `switch_account` / `logout_account` | 查看账号 UID 和登录状态，切换当前账号，或按 UID 退出指定账号 |
| `get_download_quality` | 实际探测各账号能下载的视频清晰度。结果中的 `best_qn` 和 `best_account_mids` 可用于提交下载 |
| `list_download_history` / `list_parse_history` | 查询下载和解析历史，按 `account_mid` 筛选，结果含发起账号 |
| `get_status` | 登录和大会员状态、队列汇总、下载目录剩余空间和需要注意的提示，建议第一个调用 |
| `parse_link` | 解析 B站链接（视频、合集、番剧、课程、收藏夹、UP 主等），列表会自动翻页；条目 id 稳定，可分段读取、展开分P |
| `download_batch` | 把整个链接或选中的条目作为一个批次加入下载，返回 `batch_id`；默认跳过已下载的，重复提交不会重复下载；用 `videos` 可以把多个视频（例如搜索结果）合成一个批次 |
| `get_batch_status` | 批次进度：各状态的数量、速度、预计剩余时间、实际清晰度、失败原因，以及哪些视频有 B站水印、去水印各要多久；可以用 `wait_seconds` 等待 |
| `list_batches` | 最近提交的批次 |
| `list_tasks` | 分页查看任务，可按批次、状态、标题筛选 |
| `control_tasks` | 批量暂停、继续、重试、重新下载或移除任务（不会删除已下载的文件），也可以取消正在进行的去水印 |
| `remove_watermark` | 给已下载的视频去水印，可选快速去除或 AI 精修，可以先只估算耗时；会重新编码并替换原文件 |
| `get_settings` / `update_settings` | 读取、修改下载目录、并发数、线程数、限速、自动重试、默认清晰度和下载选项 |
| `search_videos` | 按关键词搜索视频，可按发布时间、时长筛选；结果含标题、UP 主、发布时间、时长、播放量、分类、标签和简介摘要 |
| `search_users` | 按名字搜索 UP 主，返回 `mid`、粉丝数、投稿数和可以传给 `parse_link` 的空间链接 |
| `get_video_info` | 一次查询最多 20 个视频的详情：播放点赞等数据、标签、简介、分P数、所属合集，可以带相关视频 |
| `get_video_transcript` | 了解视频主要内容：B站的 AI 总结和提纲、章节、字幕全文，字幕可以分段读取。不是每个视频都有，AI 总结和 AI 字幕要登录 |
| `get_video_comments` | 读取评论和楼中楼，游标翻页，可按热门或时间排序；没有登录时 B站只给几条 |
| `start_login` | 导入浏览器登录或用 `method=qr` 扫码；`mode=add` 添加账号，`mode=reauth` 配合 `account_mid` 重新登录指定账号 |
| `get_login_status` | 跟踪登录进度、查询指定账号或列出本机浏览器。可传 `wait_seconds` 等待扫码完成 |

</details>

解析、下载和 B 站检索工具可以传 `account_mid`，省略时使用侧栏当前账号。批次、任务和历史查询省略该参数时返回全部账号，传 `null` 查归属未知的旧记录。全局下载设置由所有账号共用。

服务只监听 `127.0.0.1`（端口可改），必须带 Bearer 令牌，并校验 `Host` / `Origin` 以防 DNS 重绑定。令牌可以随时重新生成。

## 完整功能清单

<details>
<summary>支持的链接</summary>

- 普通视频（BV / av）、分P、合集、番剧和电影（ep / ss / md）、付费课程
- 收藏夹、稍后再看、UP 主的投稿、合集和系列（可按关键词筛选）
- 音频和歌单（au / am）、每周必看、各分区排行榜
- b23.tv 等短链，以及夹带标题的分享文案
- 一次解析多个链接；收藏夹、UP 主投稿等分页列表可以逐页加载

</details>

<details>
<summary>清晰度与格式</summary>

- 清晰度列表来自接口（8K / 杜比视界 / HDR / 4K / 1080P60 …），标出需要大会员的档位
- 编码优先级可选 AVC / HEVC / AV1；音轨最高支持杜比全景声和 Hi-Res 无损 FLAC
- 完整视频、仅音频或仅视频；封装为 MP4 或 MKV
- 默认用 ffmpeg 直接复制流合并，不重新编码；只有开启去水印时才重新编码视频

</details>

<details>
<summary>附加内容</summary>

- 封面：另存为图片，或写入文件
- CC 字幕：另存为 `.srt`，或写入视频
- 弹幕：`.ass` 和 / 或 `.xml`，字号、不透明度、停留时间可调
- 把 B站进度条上的分段写成真正的章节
- 为 Kodi / Jellyfin 媒体库生成 NFO 元数据
- 去水印：快速去除或 AI 精修（见 [AI 去水印](#ai-去水印)）

</details>

<details>
<summary>下载队列与网络</summary>

- 并发数、单文件分段多线程、限速、网络错误自动重试均可调
- 暂停、继续、断点续传（重启后仍可续传）；无法下载的任务写明原因
- 代理：直连、系统代理或手动设置；内置测速，可选择最快的 B站 CDN 节点
- 下载期间可以阻止系统睡眠或保持屏幕常亮，队列全部完成后发系统通知

</details>

<details>
<summary>整理与自动化</summary>

- 命名模板：支持变量（`{title}`、`{series}`、`{index:03}`、`{pubdate:YYYY-MM-DD}` …）、可选段和目录层级，单个视频、合集和番剧分别设置
- 识别已经下载过的内容，可选询问、跳过或重新下载
- 订阅：定期检查收藏夹、合集、UP 主等来源，有新内容就自动下载
- 解析记录、剪贴板监听、浅色 / 深色主题、后台运行、设置导入导出
- 应用内更新：从 GitHub Releases 获取新版本，显示更新说明，可以跳过某个版本

</details>

## 登录与隐私

登录之后，你的账号能看的清晰度和内容（1080P 及以上、大会员内容）都能下。三种登录方式，挑顺手的：

- **从浏览器导入**：复用 Chrome、Edge、Brave、Arc（仅 macOS）、Vivaldi、Opera、Chromium、Firefox 或 Safari（仅 macOS）里的登录 cookie。
  - 如果 macOS 拒绝读取，请在登录弹窗里为对应的浏览器选择数据文件夹。导入 Chromium 系浏览器时，系统还可能要求钥匙串授权。
  - 在 Linux 上，Chromium 系浏览器把 cookie 加密密钥存放在系统密钥环（GNOME Keyring / libsecret）里。应用通过 `secret-tool` 读取密钥（用 `sudo apt install libsecret-tools` 安装），密钥环可能会弹窗要求解锁。也支持 Snap 和 Flatpak 安装的 Firefox，以及 Snap 版 Chromium。
  - 在 Windows 上，Chrome 系浏览器运行时会锁住 Cookie 数据库，导入前请完全退出浏览器（包括后台运行的）。Chrome 127 起新写入的 Cookie 使用应用绑定加密，无法导入；登录 Cookie 也是这种时，请改用应用内登录或手动粘贴 Cookie。
- **在应用内登录**：打开 B站官方登录页，支持扫码、密码和短信登录。
- **手动粘贴 Cookie**：分号分隔的 cookie 字符串，或浏览器插件导出的 JSON。

启动、切回窗口、解析链接以及接口返回登录失效时，应用都会检查登录状态。登录过期后会弹出登录对话框，下载队列暂停取流，重新登录后自动继续。退出登录只清除应用自己的 cookie，不会把浏览器里的登录一起退出。

**你的数据去了哪**

- B站 cookie 保存在应用自己的数据目录里，只发给 B站，通过 MCP 也不会返回给 AI 客户端。
- 下载、合并、去水印全在本地跑。不用注册，没有遥测，中间也没有我们的服务器。
- 除了 B站，应用只会访问 GitHub（检查更新）和 ModelScope 或 Hugging Face（第一次使用 AI 精修时下载模型）。
- MCP 客户端可以在你明确要求时切换或退出指定账号。添加账号和重新登录可通过应用扫码或导入浏览器登录。需要先关闭浏览器时（Windows 上浏览器运行时会锁住 Cookie 数据库），应用会弹窗询问，只有你本人能同意。

## 常见问题

<details>
<summary>不登录能用吗？</summary>

不行。应用要登录后才能解析链接，能下的清晰度就是你账号能看的清晰度。

</details>

<details>
<summary>为什么选不了 1080P / 4K / 8K？</summary>

清晰度列表直接来自 B站对你账号返回的结果。更高的档位（1080P 高码率、4K、8K、HDR、杜比视界）通常需要大会员，而且不是每个视频都上传了所有清晰度。

</details>

<details>
<summary>macOS 说“无法打开”，怎么办？</summary>

应用没有经过 Apple 公证。先尝试打开一次，再到 **系统设置 → 隐私与安全性** 里点 **仍要打开**，或者运行 [安装](#macos) 里的 `xattr` 命令。

</details>

<details>
<summary>Windows 弹出“Windows 已保护你的电脑”，怎么办？</summary>

安装器没有代码签名。点 **更多信息 → 仍要运行**。

</details>

<details>
<summary>任务显示“无法下载”是怎么回事？</summary>

带 DRM 加密的片源、地区限制的内容，以及账号没有权限观看的内容都无法下载，任务上会写明原因。

</details>

<details>
<summary>去水印怎么这么慢？</summary>

AI 精修要逐帧重绘，比快速模式慢很多，没有显卡时更明显。开始前应用会给出预计耗时；更看重速度时请用快速模式。

</details>

<details>
<summary>有英文界面吗？</summary>

有。自 v0.13.0 起，界面支持英语、简体中文、日语、韩语、法语、意大利语、俄语和印地语。默认跟随系统语言，也可以在“设置 → 常规 → 语言”中切换。

</details>

## 限制

- 不支持带 DRM 加密的片源、地区限制的内容，以及账号没有权限观看的内容。这些任务会标为 **无法下载** 并写明原因。
- 支持 Windows x64、macOS x64 / arm64 和 Linux x64；不提供 Windows 或 Linux ARM 版本。

## 从源码构建

需要 Windows、macOS 或 Linux、Node.js 22.12 或更高版本以及 npm。

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run dev          # 开发模式
npm test             # 单元测试
npm run typecheck    # 类型检查
npm run build:mac    # 在 macOS 上运行：在 dist/ 里生成 x64 和 arm64 的 dmg / zip
npm run build:linux  # 在 Linux 上运行：在 dist/ 里生成 x64 的 AppImage / deb
npm run build:win    # 在 Windows 上运行：在 dist/ 里生成 x64 NSIS 安装器
```

开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)（英文），打包和发布见 [docs/RELEASING.md](docs/RELEASING.md)。

## 目录结构

```
src/main/auth               登录：cookie 存储、应用内登录窗口、浏览器导入、过期检测
src/main/bili               B站接口：WBI 签名、视频 / 番剧 / 课程 / 列表解析、取流、字幕、弹幕
src/main/download           下载队列、断点续传、ffmpeg 合并、附加内容（封面、字幕、NFO…）
src/main/watermark          去水印：识别水印位置，用 ffmpeg 的 delogo 去掉；ai/ 是 AI 精修（LaMa 模型、onnxruntime）
src/main/net                代理和 CDN 选择
src/main/update             应用内更新：检查 update.json、下载校验、替换 .app 或 AppImage
src/main/mcp                本地 MCP 服务
src/main/subscriptions.ts   订阅
src/shared                  各进程共用的类型、链接识别和命名模板
src/renderer                界面（React + Tailwind CSS + zustand）
scripts                     下载 ffmpeg、生成图标、发布新版本
website                     产品官网（Next.js，部署到 GitHub Pages）
```

## 参与贡献

欢迎提交 Issue 和 Pull Request，提交前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。用着顺手的话，点个 ⭐，让更多人刷到它。

## 致谢

- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) 整理的 B站接口文档
- [FFmpeg](https://ffmpeg.org) 和 [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org)、[electron-vite](https://electron-vite.org)、[electron-builder](https://www.electron.build)
- [React](https://react.dev)、[Tailwind CSS](https://tailwindcss.com)、[zustand](https://github.com/pmndrs/zustand)、[Lucide](https://lucide.dev)

## 许可证

[MIT](LICENSE) © wangzi6224

应用内置了来自 [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)（`b6.1.1`）的静态 FFmpeg。FFmpeg 作为独立程序运行，遵循它自己的许可证，不在上面的 MIT 许可范围内。它的许可证文本随应用附带，位于 `Contents/Resources/ffmpeg/LICENSE`（macOS）/ `resources/ffmpeg/LICENSE`（Windows 和 Linux），另见 [FFmpeg 许可与法律说明](https://ffmpeg.org/legal.html)。

AI 精修用 [onnxruntime](https://github.com/microsoft/onnxruntime)（MIT 许可，随应用附带）运行 [LaMa](https://github.com/advimman/lama) 修补模型（Apache-2.0 许可，ONNX 版本取自 [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX)）。模型不随安装包分发，第一次使用 AI 精修时下载。
