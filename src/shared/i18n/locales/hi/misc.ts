import type { Messages } from '../types'

export default {
  /** 接口没给会员标签时显示 */
  vipDefault: 'Bilibili Premium',
  notifyDoneTitle: 'डाउनलोड पूरा हुआ',
  notifyDoneBody: { one: '{count} कार्य पूरा हो गया', other: 'सभी {count} कार्य पूरे हो गए' },
  notifyFailedTitle: 'डाउनलोड ख़त्म, कुछ कार्य विफल रहे',
  notifyFailedBody: '{done} पूरे, {failed} विफल',
  notifySubsTitle: 'सब्सक्रिप्शन में नया कंटेंट',
  notifySubsBody: {
    one: '“{title}” में {count} नया आइटम है, डाउनलोड में जोड़ दिया गया',
    other: '“{title}” में {count} नए आइटम हैं, डाउनलोड में जोड़ दिए गए'
  },
  fetchingParts: 'वीडियो के पार्ट लाए जा रहे हैं',
  partsUnavailable: '{count} वीडियो की जानकारी नहीं मिल सकी ({reason})'
} satisfies Messages['misc']
