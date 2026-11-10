# Bili Downloader website

The bilingual product site is a static Next.js App Router project. The English page is `/` (the default) and the Chinese page is `/zh/`; the old `/en/` address redirects to `/`.

Language selection runs in an inline `<head>` script built from `lib/locale.mjs`:

- A language the visitor picked with the header or footer toggle is saved in `localStorage` (`bili-downloader-site-locale`) and always wins.
- Otherwise `/` reads the browser's primary language: any `zh*` (Simplified or Traditional) goes to `/zh/`, everything else stays in English. The result is cached the same way.
- `/zh/` only redirects to `/` when English was saved, so search engines (which have no storage) can index both pages.

```sh
npm ci
npm run dev
npm test
npm run build
npm run release
```

The GitHub Pages project path is configured as `/bili-downloader` in `next.config.mjs`. The build writes the deployable site to `out/`. Pull requests run website tests and build for validation. `npm run release` runs those same local checks and never deploys. To publish, first commit and push website changes to `main`, then run:

```sh
npm run release -- --publish --confirm-website-changes --confirm-separate-from-app
```

The script rebuilds locally, then verifies that the worktree is clean, local `main` matches `origin/main`, website files changed since the last Pages deployment, and no desktop app or Pages release is running. The Pages artifact contains a small `deployment.json` marker with the deployed commit SHA and website version, so this check survives GitHub Actions log retention. Only then does the script dispatch the separate Pages workflow through GitHub CLI. The final Pages deployment and desktop Release jobs share a concurrency lock so they cannot publish simultaneously; their builds, versions, and artifacts remain separate.

The website version in this directory is independent of the desktop app version at the repository root; app release tags never deploy the website. The desktop release workflow and this website workflow do not share version numbers or artifacts.

The branch explorer is an illustrative client-side interaction. It does not parse links or download content in the browser; those actions belong to the desktop app.
