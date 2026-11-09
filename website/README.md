# Bili Downloader website

The bilingual product site is a static Next.js App Router project. The Chinese page is `/`, and the English page is `/en/`.

```sh
npm ci
npm run dev
npm run build
```

The GitHub Pages project path is configured as `/bili-downloader` in `next.config.mjs`. The build writes the deployable site to `out/`; `.github/workflows/deploy-pages.yml` builds and publishes it through GitHub Actions.

The branch explorer is an illustrative client-side interaction. It does not parse links or download content in the browser; those actions belong to the desktop app.
