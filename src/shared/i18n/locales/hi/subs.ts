import type { Messages } from '../types'

export default {
  interval30m: '30 मिनट',
  interval1h: '1 घंटा',
  interval3h: '3 घंटे',
  interval6h: '6 घंटे',
  interval12h: '12 घंटे',
  interval1d: 'रोज़',
  everyInterval: 'हर {interval}',
  title: 'सब्सक्रिप्शन',
  subtitle: 'ऐप चलते समय पसंदीदा फ़ोल्डर, कलेक्शन, एनीमे, अपलोडर जैसे स्रोतों को तय अंतराल पर जाँचा जाता है; नया कंटेंट मिलने पर सब्सक्राइब करते समय चुने गए विकल्पों से अपने-आप डाउनलोड होता है।',
  empty: 'अभी कोई सब्सक्रिप्शन नहीं',
  emptyHint: 'पसंदीदा फ़ोल्डर, कलेक्शन, एनीमे या अपलोडर के पेज को पार्स करने के बाद चयन विंडो में नीचे “अपडेट सब्सक्राइब करें” पर क्लिक करके जोड़ें।',
  enabled: 'चालू',
  disabled: 'बंद',
  lastNew: { one: 'पिछली बार {count} नया आइटम मिला', other: 'पिछली बार {count} नए आइटम मिले' },
  checking: 'जाँच हो रही है…',
  checkNow: 'अभी जाँचें',
  unsubscribe: 'सब्सक्रिप्शन रद्द करें',
  unsubscribeConfirm: '“{title}” का सब्सक्रिप्शन रद्द करें?'
} satisfies Messages['subs']
