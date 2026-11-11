import type { Messages } from '../types'

export default {
  separator: '; ',
  parseFailures: {
    one: '{count} लिंक पार्स नहीं हो सका: {errors}',
    other: '{count} लिंक पार्स नहीं हो सके: {errors}'
  },
  watchLater: 'बाद में देखें',
  popular: 'लोकप्रिय',
  weekly: 'साप्ताहिक ज़रूर देखें (नया अंक)',
  rank: '{name} रैंकिंग',
  myFavorites: 'मेरे पसंदीदा फ़ोल्डर',
  loading: 'लोड हो रहा है…',
  noFavorites: 'कोई पसंदीदा फ़ोल्डर नहीं',
  myMenu: 'बाद में देखें, लोकप्रिय, मेरे पसंदीदा फ़ोल्डर',
  myMenuLoggedOut: 'लॉग इन के बाद उपलब्ध: बाद में देखें, लोकप्रिय, मेरे पसंदीदा फ़ोल्डर',
  batchTitle: 'बैच पार्स',
  batchSubtitle: 'हर लाइन में एक लिंक (BV नंबर, एनीमे, पसंदीदा फ़ोल्डर, अपलोडर, सब चलेगा); एक-एक करके पार्स करने के बाद सबको साथ में चुना जा सकेगा।',
  detectedLinks: { one: '{count} लिंक मिला', other: '{count} लिंक मिले' },
  cancel: 'रद्द करें',
  parseCount: '{count} पार्स करें',
  placeholder: 'वीडियो, कलेक्शन, एनीमे, कोर्स, पसंदीदा फ़ोल्डर या अपलोडर का लिंक पेस्ट करें',
  pasteAndParse: 'क्लिपबोर्ड से पेस्ट करके पार्स करें',
  parsing: 'पार्स हो रहा है',
  parse: 'पार्स करें',
  batchButton: 'बैच पार्स: एक बार में कई लाइनों के लिंक पेस्ट करें',
  parsingProgress: 'पार्स हो रहा है {done}/{total}',
  clipboardLinks: { one: 'क्लिपबोर्ड में {count} लिंक है', other: 'क्लिपबोर्ड में {count} लिंक हैं' },
  clipboardLink: 'क्लिपबोर्ड में लिंक मिला'
} satisfies Messages['input']
