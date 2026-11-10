import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { decideLocale, localeScript, LOCALE_STORAGE_KEY } from '../lib/locale.mjs';

test('Chinese browsers (simplified and traditional) get Chinese on the English root', () => {
  for (const lang of ['zh', 'zh-CN', 'zh-TW', 'zh-HK', 'zh-Hant-TW', 'zh_CN', 'ZH-cn']) {
    assert.deepEqual(decideLocale('en', null, [lang]), { locale: 'zh', persist: true, redirect: true }, lang);
  }
});

test('every other browser language gets English', () => {
  for (const languages of [['en-US'], ['ja'], ['fr-FR', 'zh-CN'], ['zhx'], [''], [], undefined]) {
    assert.deepEqual(decideLocale('en', null, languages), { locale: 'en', persist: true, redirect: false }, String(languages));
  }
});

test('a cached language wins over the browser language', () => {
  assert.deepEqual(decideLocale('en', 'en', ['zh-CN']), { locale: 'en', persist: false, redirect: false });
  assert.deepEqual(decideLocale('en', 'zh', ['en-US']), { locale: 'zh', persist: false, redirect: true });
  assert.deepEqual(decideLocale('en', 'garbage', ['en-US']), { locale: 'en', persist: true, redirect: false });
});

test('the Chinese page only redirects for an explicit English choice', () => {
  assert.deepEqual(decideLocale('zh', 'en', ['zh-CN']), { locale: 'en', persist: false, redirect: true });
  assert.deepEqual(decideLocale('zh', 'zh', ['en-US']), { locale: 'zh', persist: false, redirect: false });
  assert.deepEqual(decideLocale('zh', null, ['en-US']), { locale: 'zh', persist: false, redirect: false });
});

function runScript(pageLocale, { stored = null, languages = ['en-US'], throwingStorage = false } = {}) {
  const store = new Map(stored === null ? [] : [[LOCALE_STORAGE_KEY, stored]]);
  const replaced = [];
  const localStorage = throwingStorage
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const window = {
    localStorage,
    navigator: { languages, language: languages[0] },
    location: { search: '?a=1', hash: '#features', replace: (url) => replaced.push(url) },
  };
  const document = { documentElement: { style: {} } };
  vm.runInNewContext(localeScript(pageLocale), { window, document });
  return { stored: store.get(LOCALE_STORAGE_KEY) ?? null, replaced, hidden: document.documentElement.style.visibility === 'hidden' };
}

test('inline script redirects Chinese visitors and caches the language', () => {
  assert.deepEqual(runScript('en', { languages: ['zh-TW'] }), { stored: 'zh', replaced: ['/bili-downloader/zh/?a=1#features'], hidden: true });
  assert.deepEqual(runScript('en', { languages: ['de-DE'] }), { stored: 'en', replaced: [], hidden: false });
  assert.deepEqual(runScript('zh', { stored: 'en', languages: ['zh-CN'] }), { stored: 'en', replaced: ['/bili-downloader/?a=1#features'], hidden: true });
});

test('inline script still detects the language when storage is blocked', () => {
  assert.deepEqual(runScript('en', { languages: ['zh-CN'], throwingStorage: true }), { stored: null, replaced: ['/bili-downloader/zh/?a=1#features'], hidden: true });
});
