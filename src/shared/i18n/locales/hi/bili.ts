import type { Messages } from '../types'

// 解析 B站链接、取流时的报错和界面上的分组标题、音质标签
export default {
  // http.ts
  authExpired: 'लॉग इन अब मान्य नहीं है, कृपया फिर से लॉग इन करें',
  riskControl: 'अनुरोध को Bilibili के रिस्क कंट्रोल ने रोक दिया (HTTP 412), कृपया थोड़ी देर बाद फिर कोशिश करें',
  serverError: 'Bilibili सर्वर त्रुटि (HTTP {status})',
  networkFailed: 'नेटवर्क अनुरोध विफल: {error}',
  wbiKeyFailed: 'WBI सिग्नेचर कुंजी नहीं मिल सकी',
  badResponse: 'API ने ऐसा कंटेंट लौटाया जिसे पार्स नहीं किया जा सकता (HTTP {status})',
  apiError: 'API त्रुटि ({code})',

  // 解析结果里的分组标题
  groupAudioMenu: 'प्लेलिस्ट',
  groupCourse: 'कोर्स',
  groupFav: 'पसंदीदा फ़ोल्डर',
  groupSpace: 'अपलोड',
  groupSeason: 'कलेक्शन',
  groupSeries: 'सीरीज़',
  groupWatchLater: 'बाद में देखें',
  groupRank: '{label} रैंकिंग',
  groupMain: 'मुख्य एपिसोड',
  groupStein: 'इंटरैक्टिव वीडियो के कहानी अंश',
  groupPages: 'पार्ट',
  /** 收藏夹里已失效的视频 */
  unavailable: 'उपलब्ध नहीं',

  // lists.ts、lookup.ts、resolve.ts
  spaceRejected: 'Bilibili ने फ़िलहाल अपलोडर के अपलोड की सूची का अनुरोध ठुकरा दिया ({error}); कृपया थोड़ी देर बाद फिर कोशिश करें, या अपलोडर के कलेक्शन या पसंदीदा फ़ोल्डर का लिंक पेस्ट करें',
  weeklyNoNumber: 'साप्ताहिक ज़रूर देखें का अंक नंबर नहीं मिला',
  captcha: 'Bilibili ने ह्यूमन वेरिफ़िकेशन माँगा, इस खोज का कोई नतीजा नहीं मिला',
  unrecognized: 'Bilibili वीडियो, एनीमे, कोर्स, पसंदीदा फ़ोल्डर या अपलोडर का लिंक नहीं पहचाना गया',
  batchAllFailed: {
    one: '{count} लिंक पार्स नहीं हो सका: {error}',
    other: 'सभी {count} लिंक पार्स नहीं हो सके: {error}'
  },
  batchTitle: 'बैच पार्स ({count} स्रोत)',

  // 排行榜分区（界面显示用）
  rankAll: 'पूरी साइट',
  rankDouga: 'एनिमेशन',
  rankMusic: 'संगीत',
  rankDance: 'डांस',
  rankGame: 'गेम',
  rankKnowledge: 'ज्ञान',
  rankTech: 'टेक',
  rankSports: 'खेल',
  rankCar: 'कार',
  rankLife: 'लाइफ़स्टाइल',
  rankFood: 'खाना',
  rankAnimal: 'जानवर',
  rankKichiku: 'रीमिक्स (Kichiku)',
  rankFashion: 'फ़ैशन',
  rankEnt: 'मनोरंजन',
  rankCinephile: 'फ़िल्म और टीवी',
  rankOrigin: 'ओरिजिनल',
  rankRookie: 'नए क्रिएटर',

  // 音质
  audioBest: 'सर्वश्रेष्ठ',
  audioFlac: 'Hi-Res लॉसलेस',
  audioDolby: 'Dolby Atmos',
  audioLossless: 'लॉसलेस',
  /** 任务上显示的音频画质，label 例如“320K”“无损” */
  audioQuality: 'ऑडियो {label}',
  audioNoUrl: 'इस गाने का डाउनलोड पता नहीं मिला',
  audioNoUrlReason: 'इस गाने का डाउनलोड पता नहीं मिला: {reason}',

  // danmaku.ts
  danmakuHttpFailed: 'डैनमाकू डाउनलोड विफल (HTTP {status})',

  // playurl.ts
  courseNoAccess: 'इस लेसन को देखने की अनुमति नहीं है (शायद ख़रीदना होगा): {reason}',
  courseDrm: 'यह लेसन DRM एन्क्रिप्टेड है, डाउनलोड समर्थित नहीं है',
  coursePreview: 'मौजूदा खाते से इस लेसन का सिर्फ़ प्रीव्यू देखा जा सकता है (ख़रीदना होगा)',
  audioNotVideo: 'ऑडियो वीडियो स्ट्रीम API से नहीं लिया जाता',
  regionLocked: 'क्षेत्रीय प्रतिबंध: {reason}',
  needVip: 'Bilibili Premium ज़रूरी: {reason}',
  drm: 'यह कंटेंट DRM एन्क्रिप्टेड है, डाउनलोड समर्थित नहीं है',
  previewOnly: 'मौजूदा खाते से इस कंटेंट का सिर्फ़ प्रीव्यू देखा जा सकता है (Bilibili Premium या ख़रीदारी ज़रूरी)',
  flvOnly: 'यह वीडियो सिर्फ़ पुराने FLV फ़ॉर्मेट में है, जो अभी समर्थित नहीं है',
  noAudioTrack: 'इस वीडियो में अलग ऑडियो ट्रैक नहीं है',
  noVideoStream: 'कोई उपलब्ध वीडियो स्ट्रीम नहीं',
  codecFallback: 'इस क्वालिटी में {wanted} नहीं है, इसलिए {actual} इस्तेमाल किया गया',
  flacToMkv: 'Hi-Res लॉसलेस ऑडियो ट्रैक MP4 में ठीक से नहीं चलता, इसलिए MKV इस्तेमाल किया गया',
  /** 画质标签里“只下画面”的标记 */
  mute: 'बिना आवाज़'
} satisfies Messages['bili']
