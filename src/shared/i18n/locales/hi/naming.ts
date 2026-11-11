import type { Messages } from '../types'

export default {
  varTitle: 'टाइटल (पार्ट / एपिसोड का टाइटल)',
  varSeries: 'कलेक्शन, सीरीज़ या कई पार्ट वाले वीडियो का मुख्य टाइटल; एक अकेले वीडियो में ख़ाली',
  varIndex: 'क्रमांक',
  varOwner: 'अपलोडर',
  varOwnerMid: 'अपलोडर UID',
  varPubdate: 'प्रकाशन समय',
  varDate: 'कार्य बनाने का समय',
  varQuality: 'क्वालिटी',
  varCodec: 'कोडेक',
  varBvid: 'BV नंबर',
  varAid: 'av नंबर',
  varCid: 'cid',
  varEpId: 'एनीमे एपिसोड ID',
  varType: 'प्रकार (वीडियो / एनीमे और फ़िल्में)',
  empty: 'टेम्पलेट ख़ाली नहीं हो सकता',
  nested: 'वैकल्पिक हिस्से <…> एक-दूसरे के अंदर नहीं हो सकते',
  extraClose: 'एक > ज़्यादा है',
  unclosed: 'वैकल्पिक हिस्सा <…> बंद नहीं हुआ है',
  /** variable 是带花括号的变量，例如 {foo} */
  unknownVar: 'अज्ञात वेरिएबल {variable}',
  unfinishedBrace: 'वेरिएबल का कर्ली ब्रैकेट पूरा नहीं है'
} satisfies Messages['naming']
