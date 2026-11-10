import '../styles.css';
import { pageMetadata } from '../site-metadata';
import { localeScript } from '../../lib/locale.mjs';

export const metadata = pageMetadata('zh');

export default function ChineseRootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeScript('zh') }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
