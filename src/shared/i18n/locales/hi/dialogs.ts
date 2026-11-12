import type { Messages } from '../types'

export default {
  ok: 'ठीक है',
  cancel: 'रद्द करें',
  logoutMessage: 'क्या आप लॉग आउट करना चाहते हैं?',
  logoutDetail: 'लॉग आउट के बाद फिर से इम्पोर्ट या लॉग इन करना होगा।',
  mcpLogoutMessage: 'आपका AI सहायक {name} से लॉग आउट करना चाहता है। लॉग आउट करें?',
  logoutConfirm: 'लॉग आउट',
  upToDate: 'नवीनतम वर्ज़न है',
  currentVersion: 'मौजूदा वर्ज़न {version}',
  quitPending: {
    one: '{count} कार्य अभी पूरा नहीं हुआ है, क्या आप ऐप बंद करना चाहते हैं?',
    other: '{count} कार्य अभी पूरे नहीं हुए हैं, क्या आप ऐप बंद करना चाहते हैं?'
  },
  quitPendingDetail:
    'अधूरे कार्य रुक जाएँगे; अगली बार खोलकर “सब जारी रखें” पर क्लिक करने से डाउनलोड वहीं से जारी रहेगा, डाउनलोड हुआ हिस्सा नहीं खोएगा; जिन वीडियो से वॉटरमार्क हटाया जा रहा है, वे जैसे थे वैसे ही रहेंगे।',
  runInBackground: 'बैकग्राउंड में चलाएँ',
  quit: 'बंद करें',
  closeBrowserMessage: 'Bilibili लॉग इन जानकारी इम्पोर्ट करने के लिए {browser} बंद करें?',
  closeBrowserRequest: 'AI असिस्टेंट Bilibili लॉग इन जानकारी इम्पोर्ट करना चाहता है, लेकिन {browser} चल रहा है, इसलिए उसका डेटा पढ़ा नहीं जा सकता।',
  closeBrowserRisk: 'बंद करने पर बिना सेव किया कंटेंट खो सकता है; अगर {browser} समय पर बंद नहीं हुआ तो उसे ज़बरदस्ती बंद कर दिया जाएगा।',
  closeBrowserAppBound: '{browser} में ऐप-बाउंड एन्क्रिप्शन चालू है, बंद करने के बाद भी लॉग इन जानकारी शायद पढ़ी न जा सके।',
  closeBrowserUnknown: 'अभी पक्का नहीं है कि {browser} में Bilibili लॉग इन जानकारी है या नहीं।',
  closeBrowserConfirm: '{browser} बंद करके इम्पोर्ट करें',
  useQrInstead: 'QR कोड स्कैन करें',
  loginWindowTitle: 'Bilibili में लॉग इन करें',
  chooseDownloadDir: 'डाउनलोड फ़ोल्डर चुनें'
} satisfies Messages['dialogs']
