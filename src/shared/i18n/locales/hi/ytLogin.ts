import type { Messages } from '../types'

export default {
  noLoginCookie: 'YouTube की लॉग इन जानकारी नहीं मिली (SAPISID मौजूद नहीं है)। पक्का करें कि आपने ब्राउज़र में YouTube पर लॉग इन किया है',
  verifyFailed: 'YouTube लॉग इन की पुष्टि करते समय त्रुटि: {reason}',
  expired: 'यह YouTube लॉग इन अब मान्य नहीं है। ब्राउज़र में YouTube में फिर से लॉग इन करके दोबारा इम्पोर्ट करें',
  accountNotFound: 'यह YouTube खाता नहीं मिला',
  noLoginInBrowser: 'इस ब्राउज़र प्रोफ़ाइल में YouTube लॉग इन नहीं है। पहले ब्राउज़र में YouTube में लॉग इन करें'
} satisfies Messages['ytLogin']
