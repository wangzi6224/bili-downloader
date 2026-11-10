import '../styles.css';
import { pageMetadata } from '../site-metadata';
import { localeScript } from '../../lib/locale.mjs';

export const metadata = pageMetadata('en');

export default function EnglishRootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeScript('en') }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
