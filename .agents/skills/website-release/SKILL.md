---
name: website-release
description: 独立发布 bili-downloader 官网到 GitHub Pages。用户要部署、发布或检查官网发布流程时使用；先运行网站单测和静态构建，通过后才可派发 Pages 工作流。
---

# 发布官网

官网版本独立记录在 `website/package.json` 和 `website/package-lock.json`，与根目录桌面应用版本无关。官网不打 tag、不创建 GitHub Release，也不触发桌面安装包构建。桌面应用 tag 不会部署官网。

## 本地检查

在仓库根目录执行：

```bash
cd website
npm ci
npm run release
```

`npm run release` 只运行网站单元测试和 Next.js 静态构建，输出 `out/`；不会访问 GitHub 或部署。测试或构建失败时不能继续发布。

需要给官网记录一个独立版本时，只在 `website/` 内更新版本：

```bash
npm version patch --no-git-tag-version
```

按实际改动选择 `patch`、`minor` 或明确的版本号。不要修改根目录 `package.json` 的桌面应用版本。

## 发布

先确认官网目录自上次成功部署以来有改动，并且桌面应用发布流程已经结束。提交并推送官网改动到 `main` 后，从 `website/` 运行：

```bash
npm run release -- --publish --confirm-website-changes --confirm-separate-from-app
```

脚本会重新运行单测和静态构建；通过后检查当前分支为 `main`、工作区干净、本地提交与 `origin/main` 一致、`website/` 相对上次实际 Pages 部署有变动，且应用发布和 Pages 工作流都没有运行。Pages 静态产物会保存上次部署的提交 SHA 和官网版本，作为长期有效的部署基线；工作流记录只在首次升级时作回退。所有检查通过后，脚本仅使用 `gh workflow run` 派发 `.github/workflows/deploy-pages.yml`，不会调用自写 GitHub API，也不会触发应用发布。工作流自身也会校验手动确认及官网文件改动；最终部署 job 与应用 Release job 使用共同的并发锁，避免同时发布。

官网工作流仍要求两个确认输入为 true，并且只在 `main` 的手动派发中部署。PR 只验证测试和构建。部署后通过 Actions 核对 Pages 工作流结果；桌面包发布和官网部署分别查看各自工作流。

## 不要做

- 不要在本地测试或构建失败时派发部署。
- 不要在 website 目录无改动时重复部署。
- 不要在桌面应用发布进行中时部署官网，也不要把官网版本和桌面版本绑在一起。
- 一次只启动一个发布操作；等待当前应用 Release 或 Pages workflow 完成后再发起下一个。
- 不要使用桌面应用的 `release` skill 发布官网。
