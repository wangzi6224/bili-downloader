import '../styles.css';
import { pageMetadata } from '../site-metadata';

export const metadata = pageMetadata('en');

export default function EnglishRootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
