import type { Messages } from '../types'

export default {
  macFileManager: 'Finder',
  macReopenFrom: 'Dock या मेनू बार आइकन',
  macAv1Hint: 'सबसे कम जगह लेता है, M1 या उसके बाद का Mac ज़रूरी',
  macChromiumAuthHint: 'Chrome-आधारित ब्राउज़र से इम्पोर्ट करते समय macOS कीचेन की अनुमति माँगेगा, कृपया “अनुमति दें” पर क्लिक करें।',
  linuxFileManager: 'फ़ाइल मैनेजर',
  linuxChromiumAuthHint: 'Chrome-आधारित ब्राउज़र की लॉग इन जानकारी सिस्टम कीरिंग में रहती है; इम्पोर्ट करते समय कीरिंग अनलॉक करने को कहा जाए तो अपना लॉग इन पासवर्ड डालें।',
  winFileManager: 'फ़ाइल एक्सप्लोरर',
  winChromiumAuthHint: 'इम्पोर्ट करते समय मौजूदा Windows यूज़र की पहचान से ब्राउज़र की कुंजी खोली जाती है, कोई अनुमति विंडो नहीं आएगी।',
  trayIcon: 'ट्रे आइकन',
  av1Hint: 'सबसे कम जगह लेता है, पुराने कंप्यूटर पर चलाते समय अटक सकता है'
} satisfies Messages['platform']
