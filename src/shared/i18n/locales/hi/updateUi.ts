import type { Messages } from '../types'

export default {
  skipVersion: 'यह वर्ज़न छोड़ें',
  notNow: 'अभी नहीं',
  openDownloadPage: 'डाउनलोड पेज पर जाएँ',
  downloadAndInstall: 'डाउनलोड और इंस्टॉल करें',
  cancelDownload: 'डाउनलोड रद्द करें',
  downloadInBackground: 'बैकग्राउंड में डाउनलोड करें',
  restartAndInstall: 'रीस्टार्ट करके इंस्टॉल करें',
  installingButton: 'इंस्टॉल हो रहा है…',
  retry: 'फिर कोशिश करें',
  title: 'नया वर्ज़न {version} उपलब्ध है',
  currentVersion: 'मौजूदा वर्ज़न {version}',
  releasedOn: '{date} को रिलीज़',
  packageSize: 'इंस्टॉलर {size}',
  noNotes: 'इस वर्ज़न के लिए कोई अपडेट नोट्स नहीं लिखे गए हैं।',
  blocker: '{blocker}, या डाउनलोड पेज पर जाकर मैन्युअली इंस्टॉल करें।',
  skipped: 'आपने यह वर्ज़न पहले छोड़ दिया था, ऑटोमैटिक जाँच में इसकी याद नहीं दिलाई जाएगी।',
  downloading: 'डाउनलोड हो रहा है… विंडो बंद करने पर भी जारी रहेगा',
  pendingTasks: {
    one: '{count} कार्य अभी पूरा नहीं हुआ है; रीस्टार्ट करने पर यह रुक जाएगा, अपडेट के बाद इसे जारी रखा जा सकता है।',
    other: '{count} कार्य अभी पूरे नहीं हुए हैं; रीस्टार्ट करने पर ये रुक जाएँगे, अपडेट के बाद इन्हें जारी रखा जा सकता है।'
  },
  ready: 'नया वर्ज़न डाउनलोड और सत्यापित हो गया है, रीस्टार्ट के बाद इस्तेमाल कर सकते हैं।',
  installing: 'इंस्टॉल हो रहा है, ऐप जल्द ही अपने-आप फिर खुल जाएगा…'
} satisfies Messages['updateUi']
