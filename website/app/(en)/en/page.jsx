import { LOCALE_PATHS, SITE_BASE_PATH } from '../../../lib/locale.mjs';
import { pageMetadata } from '../../site-metadata';

// The English site used to live at /en/. Keep old links working by sending them to the root.
export const metadata = {
  ...pageMetadata('en'),
  robots: { index: false, follow: true },
};

export default function LegacyEnglishRedirect() {
  const target = SITE_BASE_PATH + LOCALE_PATHS.en;
  return (
    <main style={{ padding: 24 }}>
      <meta httpEquiv="refresh" content={'0; url=' + target} />
      <p>
        Bili Downloader has moved to <a href={target}>the new address</a>.
      </p>
    </main>
  );
}
