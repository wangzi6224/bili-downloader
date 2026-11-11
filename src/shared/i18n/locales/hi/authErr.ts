import type { Messages } from '../types'

export default {
  loginRequired: 'कृपया पहले लॉग इन करें',
  loginRequiredAccount: 'कृपया पहले Bilibili खाते में लॉग इन करें',
  loginExpired: 'लॉग इन की अवधि समाप्त हो गई है, कृपया फिर से लॉग इन करें',
  appBoundCookie: 'ऐप-बाउंड एन्क्रिप्शन वाली Cookie इम्पोर्ट नहीं हो सकती; कृपया ऐप के अंदर लॉग इन करें या Cookie मैन्युअली पेस्ट करें',
  missingKey: '{prefix} को डिक्रिप्ट करने की कुंजी नहीं मिली',
  incompleteCookie: 'Chromium Cookie का एन्क्रिप्टेड डेटा अधूरा है',
  /** 没有权限读取的浏览器，在配置档名的位置显示 */
  blockedProfile: 'पढ़ने की अनुमति नहीं',
  keychainNotFound: 'कीचेन में “{service}” नहीं मिला',
  keychainDenied: 'कीचेन की अनुमति नहीं मिली ({service}); कृपया सिस्टम डायलॉग में “अनुमति दें” पर क्लिक करें',
  secretToolMissing:
    'Chrome-आधारित ब्राउज़र की लॉग इन जानकारी पढ़ने के लिए secret-tool चाहिए; कृपया पहले इसे इंस्टॉल करें (Debian / Ubuntu: sudo apt install libsecret-tools), या ऐप के अंदर लॉग इन करें',
  keyringNotFound: 'सिस्टम कीरिंग में ब्राउज़र का पासवर्ड नहीं मिला (application={application}), या कीरिंग अनलॉक नहीं है। आप ऐप के अंदर लॉग इन भी कर सकते हैं',
  winKeyUnreadable: 'Windows ब्राउज़र की एन्क्रिप्शन कुंजी पढ़ी नहीं जा सकी; कृपया ऐप के अंदर लॉग इन करें या Cookie मैन्युअली पेस्ट करें',
  winKeyMissing: 'Windows ब्राउज़र में पढ़ने लायक DPAPI कुंजी नहीं है; कृपया ऐप के अंदर लॉग इन करें या Cookie मैन्युअली पेस्ट करें',
  winKeyUnsupported: 'Windows ब्राउज़र की कुंजी का फ़ॉर्मेट समर्थित नहीं है; कृपया ऐप के अंदर लॉग इन करें या Cookie मैन्युअली पेस्ट करें',
  browserLocked: '{browser} चल रहा है, इसलिए उसकी लॉग इन जानकारी पढ़ी नहीं जा सकती। कृपया {browser} को पूरी तरह बंद करें (बैकग्राउंड में चल रहे प्रोसेस समेत) और फिर इम्पोर्ट करें, या ऐप के अंदर लॉग इन करें',
  profileNotFound: 'यह ब्राउज़र प्रोफ़ाइल नहीं मिली, या उसे पढ़ने की अनुमति नहीं है',
  noPermission: '{browser} का डेटा पढ़ने की अनुमति नहीं है',
  noLogin: '{browser} ({profile}) में Bilibili लॉग इन जानकारी नहीं है',
  importedExpired: 'इम्पोर्ट की गई लॉग इन जानकारी अब मान्य नहीं है; कृपया पहले ब्राउज़र में Bilibili में फिर से लॉग इन करें, या ऐप के अंदर लॉग इन करें',
  cookieUnreadable: 'यह कंटेंट समझ नहीं आया; कृपया “SESSDATA=…; bili_jct=…” जैसी Cookie, या एक्सटेंशन से एक्सपोर्ट किया गया JSON पेस्ट करें',
  noSessdata: 'इसमें SESSDATA नहीं है, लॉग इन नहीं हो सकता',
  cookieExpired: 'यह Cookie अब मान्य नहीं है, कृपया नई लें',
  confirmTimeout: 'लॉग इन की पुष्टि में समय सीमा पार हो गई, कृपया नेटवर्क जाँचें',
  importCancelled: 'यह इम्पोर्ट रद्द कर दिया गया',
  dpapiTimeout: 'DPAPI डिक्रिप्शन में समय सीमा पार हो गई; कृपया ऐप के अंदर लॉग इन करें या Cookie मैन्युअली पेस्ट करें',
  dpapiFailed: 'DPAPI डिक्रिप्शन विफल: {reason}',
  powershellExitCode: 'PowerShell एग्ज़िट कोड {code}',
  dpapiIncomplete: 'PowerShell ने पूरा डिक्रिप्शन नतीजा नहीं लौटाया',
  safariCorrupt: 'Safari की Cookie फ़ाइल ख़राब है',
  notSafariCookies: 'यह Safari की Cookie फ़ाइल नहीं है'
} satisfies Messages['authErr']
