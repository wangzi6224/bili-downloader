export const LOCALE_STORAGE_KEY = 'bili-downloader-site-locale';
export const SITE_BASE_PATH = '/bili-downloader';
export const SITE_ORIGIN = 'https://wangzi6224.github.io';

export const LOCALE_PATHS = {
  en: '/',
  zh: '/zh/',
};

export function localeUrl(locale) {
  return SITE_ORIGIN + SITE_BASE_PATH + LOCALE_PATHS[locale];
}

// Self-contained on purpose: it is serialized into the inline <head> script,
// so it must not reference anything outside its own body.
//   stored    - value read from localStorage (may be null or garbage)
//   languages - navigator.languages (or [navigator.language])
// Returns { locale, persist, redirect }:
//   locale   - the language this visitor should see
//   persist  - write `locale` to localStorage
//   redirect - the page is in the wrong language and must navigate to `locale`
export function decideLocale(pageLocale, stored, languages) {
  var saved = stored === 'zh' || stored === 'en' ? stored : null;
  var primary = languages && languages.length ? languages[0] : '';
  var detected = typeof primary === 'string' && /^zh(?:[-_]|$)/i.test(primary.trim()) ? 'zh' : 'en';

  if (pageLocale === 'zh') {
    // A direct visit to the Chinese page only moves away for an explicit English choice,
    // so search engines (no storage) can still index it.
    if (saved === 'en') return { locale: 'en', persist: false, redirect: true };
    return { locale: 'zh', persist: false, redirect: false };
  }

  var locale = saved || detected;
  return { locale: locale, persist: !saved, redirect: locale !== pageLocale };
}

export function localeScript(pageLocale) {
  const paths = { en: SITE_BASE_PATH + LOCALE_PATHS.en, zh: SITE_BASE_PATH + LOCALE_PATHS.zh };
  return `(function(){try{
var key=${JSON.stringify(LOCALE_STORAGE_KEY)},paths=${JSON.stringify(paths)},stored=null;
try{stored=window.localStorage.getItem(key);}catch(e){}
var nav=window.navigator||{},langs=nav.languages&&nav.languages.length?nav.languages:[nav.language||''];
var d=(${decideLocale.toString()})(${JSON.stringify(pageLocale)},stored,langs);
if(d.persist){try{window.localStorage.setItem(key,d.locale);}catch(e){}}
if(d.redirect){document.documentElement.style.visibility='hidden';window.location.replace(paths[d.locale]+window.location.search+window.location.hash);}
}catch(e){}})();`;
}
