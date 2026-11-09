# Bili Downloader website

The bilingual product site is a static Next.js App Router project. The Chinese page is `/`, and the English page is `/en/`.

```sh
npm ci
npm run dev
npm run build
```

The GitHub Pages project path is configured as `/bili-downloader` in `next.config.mjs`. The build writes the deployable site to `out/`. Pull requests build the site for validation. Publish only after files under `website/` have changed since the previous website deployment. The separate manual workflow dispatch from `main` requires confirmation that website files changed and no desktop app package release is running. App release tags never deploy the website; run the website deployment after the app release workflow has finished.

The branch explorer is an illustrative client-side interaction. It does not parse links or download content in the browser; those actions belong to the desktop app.
