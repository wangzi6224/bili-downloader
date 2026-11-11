import type { Messages } from '../types'

export default {
  exportTitle: 'कॉन्फ़िगरेशन एक्सपोर्ट करें',
  importTitle: 'कॉन्फ़िगरेशन इम्पोर्ट करें',
  exported: '{path} में एक्सपोर्ट हो गया',
  invalidJson: 'यह फ़ाइल मान्य JSON नहीं है',
  notOurs: 'यह इस ऐप से एक्सपोर्ट की गई कॉन्फ़िगरेशन फ़ाइल नहीं है',
  imported: 'सेटिंग्स और {count} सब्सक्रिप्शन इम्पोर्ट हो गए ({app} से {date} को एक्सपोर्ट किए गए)',
  namingInvalid: 'नामकरण टेम्पलेट में गड़बड़ी: {reason}'
} satisfies Messages['config']
