'use client';

import Link from 'next/link';
import { LOCALE_PATHS, LOCALE_STORAGE_KEY } from '../lib/locale.mjs';

// Switching language by hand is remembered, so the next visit opens in the chosen language.
export default function LanguageToggle({ to, className, children }) {
  function remember() {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, to);
    } catch {
      // Storage can be blocked (private mode, disabled site data); the link still works.
    }
  }

  return (
    <Link className={className} href={LOCALE_PATHS[to]} lang={to === 'zh' ? 'zh-CN' : 'en'} hrefLang={to === 'zh' ? 'zh-CN' : 'en'} onClick={remember}>
      {children}
    </Link>
  );
}
