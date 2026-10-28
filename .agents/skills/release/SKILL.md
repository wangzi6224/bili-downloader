---
name: release
description: 发布 B站下载器（bili-downloader）的新版本：定版本号、整理 CHANGELOG.md、提交并推送 v版本号 的 tag，由 GitHub Actions 自动测试、打包两个架构并发布到 GitHub Releases，再跟踪运行、核对 Release。用户要发布、发版、出新版本、打 tag、release、bump version，或问发布流程、发布失败怎么处理、想先验证能不能打出包时使用。
---

# 发布新版本

推送 `v版本号` 的 tag 会触发 `.github/workflows/release.yml`：在 macOS runner 上检查版本 → `npm ci` → 类型检查、单元测试和覆盖率门槛（`npm run build:mac` 里先跑 `npm run verify`）→ 打包 x64 和 arm64 → `scripts/release.mjs` 创建 Release，上传两个 zip、两个 dmg 和 `update.json`。已安装的应用从 `releases/latest/download/update.json` 检查更新，所以**推送 tag 就等于把新版本发给所有用户**，推送前必须得到用户明确同意。

更多背景见 `docs/RELEASING.md`。版本号和更新日志的解析规则以 `scripts/release.mjs` 和 `scripts/lib/release.mjs` 为准。

## 1. 发布前检查

```bash
git switch main && git pull --ff-only
git status --porcelain                          # 必须没有输出
gh run list --workflow release.yml --limit 3    # 不能有正在跑的发布
npm run verify                                  # 类型检查 + 单元测试 + 覆盖率门槛
```

有未提交的改动、本地和 origin/main 不一致、或者测试没过，先停下来告诉用户，不要自行处理。

## 2. 定版本号

- 上一个版本：`git describe --tags --abbrev=0`；之后的改动：`git log --oneline <上一个 tag>..HEAD`
- 用户没给版本号时按 semver 提议一个，请用户确认：有新功能升 minor，只有修复升 patch；现在还是 0.x，除非用户要求，不升 major
- 带后缀的版本号（如 `1.0.0-beta.1`）会发成预发布版本，已安装的正式版收不到
- 版本号不能复用，`gh release view v<版本>` 能查到就换一个

```bash
npm version <版本> --no-git-tag-version   # 同时改 package.json 和 package-lock.json，不提交、不打 tag
```

## 3. 写更新日志

`CHANGELOG.md` 每个版本一段，标题必须是 `## <版本> - YYYY-MM-DD`（今天的日期，`date +%F`），下面用列表写变化，新的一段放在已有版本段的最上面。这段会原样显示在应用的更新弹窗和 Release 页面上，读者是普通用户：

- 有“未发布”一段就把它的标题改成新版本的标题，内容按下面的要求过一遍
- 没有就根据 `git log` 起草：只写用户能感知到的变化（新功能、修复、界面调整），不写重构、测试、CI、文档之类的内部改动
- 简体中文，一条说一件事，写清楚在哪里、有什么用，风格参照已有的段落；可以用 `**粗体**`、`` `代码` `` 和链接

起草的日志先给用户看，确认后再继续。

## 4. 本地预检

```bash
node scripts/release.mjs --check
```

输出 `✓ v<版本> 可以发布` 才继续。它检查更新日志里有没有这个版本、这个版本是否已经发布过，和工作流第一步做的检查一样。

## 5. 提交并推送 main

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: 发布 <版本>"
git push origin main
```

## 6. 推送 tag（必须先得到用户确认）

把版本号和更新日志再给用户过一遍，说明推送后会自动发给所有用户，得到明确同意后：

```bash
git tag v<版本>
git push origin v<版本>
```

## 7. 跟踪工作流

```bash
gh run list --workflow release.yml --event push --limit 1   # 拿到 run id
gh run watch <run-id> --exit-status                          # 一般 3～5 分钟
```

能在后台运行命令的话放到后台等，不要反复轮询。失败时用 `gh run view <run-id> --log-failed` 看原因。

## 8. 核对结果

```bash
gh release view v<版本> --json isPrerelease,url,assets -q '.url, .isPrerelease, .assets[].name'
node -e "fetch('https://github.com/wangzi6224/bili-downloader/releases/latest/download/update.json').then(r => r.json()).then(m => console.log(m.version))"
```

- 资源里应有 `bili-downloader-<版本>-arm64.zip`、`-arm64.dmg`、`-x64.zip`、`-x64.dmg` 和 `update.json`
- 正式版：`latest` 清单的版本应等于新版本；预发布版本不会改变 `latest`

最后把 Release 链接和核对结果告诉用户。

## 出错怎么办

| 情况 | 处理 |
| --- | --- |
| “检查版本”这一步失败 | 看日志：tag 和 `package.json` 版本不一致、更新日志里没有这个版本、或已经发布过。修好并推送到 main 后，告诉用户要删掉旧 tag 重打：`git push origin :refs/tags/v<版本> && git tag -d v<版本>`，再回到第 6 步 |
| 类型检查、测试、覆盖率门槛或打包失败 | 同上：修复 → 删 tag → 在修好的提交上重打 |
| 网络之类的偶发失败，Release 还没创建 | `gh run rerun <run-id> --failed` |
| Release 已经创建但有问题 | 用户可能已经更新了，不要删掉后用同一个版本号重发；告诉用户，一般是修好后发一个新的补丁版本 |

## 只验证打包，不发布

改了 `electron-builder.yml`、`scripts/fetch-ffmpeg.mjs`、依赖等打包相关的内容，推送到 main 后可以先手动跑一次：

```bash
gh workflow run release.yml --ref main
```

手动运行只打包不发布，安装包和 `update.json` 作为这次运行的产物保留 7 天。

## Actions 不可用时

在本机（macOS）运行 `npm run release`：同样先检查，再打包两个架构，用 `gh` 创建 Release（tag 不存在会自动创建）。推送前同样要用户确认。只在 Actions 确实不可用时这样做，不要和工作流同时发同一个版本。

## 不要做

- 不要在用户确认前推送 tag，不要强推或移动已经有 Release 的 tag
- 不要手动替换已发布 Release 里的文件：`update.json` 里记录了 zip 的 sha512，对不上应用会拒绝更新
- 不要跳过 `CHANGELOG.md`：没有这个版本的说明，工作流第一步就会失败
