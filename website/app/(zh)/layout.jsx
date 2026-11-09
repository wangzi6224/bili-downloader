import '../styles.css';
import { pageMetadata } from '../site-metadata';

export const metadata = pageMetadata('zh');

export default function ChineseRootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
