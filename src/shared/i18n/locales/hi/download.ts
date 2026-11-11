import type { Messages } from '../types'

// 下载、合并、附加内容（封面、字幕、弹幕）相关的报错和提示
export default {
  // errors.ts：文件系统错误
  diskFull: 'डिस्क में पर्याप्त जगह नहीं है',
  /** 拼在下面几条报错后面，指出出错的路径 */
  atPath: ': {path}',
  noWritePermission: 'लिखने की अनुमति नहीं है{where}',
  readOnlyDisk: 'लक्ष्य डिस्क सिर्फ़ पढ़ने के लिए है{where}',
  dirMissing: 'डाउनलोड फ़ोल्डर मौजूद नहीं है या बाहरी डिस्क डिस्कनेक्ट हो गई है{where}',
  writeFailed: 'फ़ाइल लिखना विफल ({code}){where}',

  // extras.ts
  coverFailed: 'कवर डाउनलोड विफल: {error}',
  noCcSubtitle: 'कोई CC सबटाइटल नहीं',
  subtitleFailed: 'सबटाइटल/चैप्टर नहीं मिल सके: {error}',
  danmakuFailed: 'डैनमाकू डाउनलोड विफल: {error}',
  coverSaveFailed: 'कवर सेव विफल: {error}',
  subtitleSaveFailed: 'सबटाइटल सेव विफल: {error}',
  danmakuSaveFailed: 'डैनमाकू सेव विफल: {error}',
  nfoSaveFailed: 'NFO सेव विफल: {error}',
  embedFallback: 'कवर/सबटाइटल/चैप्टर वीडियो में नहीं जोड़े जा सके, इसलिए अलग से सेव किए गए',

  // fetchFile.ts
  sizeFailed: 'फ़ाइल का साइज़ नहीं मिल सका (HTTP {status})',
  connectFailed: 'डाउनलोड सर्वर से कनेक्ट नहीं हो सका: {error}',
  timeout: 'कनेक्शन का समय समाप्त',
  httpFailed: 'डाउनलोड विफल (HTTP {status})',
  badRange: 'सर्वर ने ग़लत डेटा रेंज लौटाई',
  interrupted: 'कनेक्शन टूट गया',
  incomplete: 'फ़ाइल अधूरी है ({done}/{total})',

  // manager.ts
  deleteFailed: {
    one: '{count} फ़ाइल नहीं मिटाई जा सकी: {files}',
    other: '{count} फ़ाइलें नहीं मिटाई जा सकीं: {files}'
  },
  busy: 'यह वीडियो प्रोसेस हो रहा है, कृपया पूरा होने का इंतज़ार करें',
  badRegion: 'वॉटरमार्क क्षेत्र अमान्य है',
  fileLocked: 'मूल वीडियो किसी दूसरे प्रोग्राम में खुला है, इसलिए बदला नहीं जा सका',

  // mux.ts：ffmpeg 报错，action 是下面三个之一
  actionMux: 'मर्ज',
  actionWatermark: 'वॉटरमार्क हटाना',
  actionRead: 'वीडियो पढ़ना',
  ffNoSpace: '{action} विफल: डिस्क में पर्याप्त जगह नहीं है',
  ffNoPermission: '{action} विफल: लक्ष्य फ़ोल्डर में लिखने की अनुमति नहीं है',
  ffLogoOutside: '{action} विफल: वॉटरमार्क की जगह फ़्रेम से बाहर है',
  ffEncoder: '{action} विफल: एनकोडर उपलब्ध नहीं है',
  ffCorrupt: '{action} विफल: डाउनलोड की गई फ़ाइल ख़राब है, कृपया “फिर से डाउनलोड करें” पर क्लिक करें',
  ffContainer: 'मर्ज विफल: यह कोडेक मौजूदा कंटेनर फ़ॉर्मेट में नहीं जा सकता, कृपया सेटिंग्स में MKV चुनें',
  ffExit: '{action} विफल (ffmpeg एग्ज़िट कोड {code}): {detail}',
  ffSpawn: 'ffmpeg नहीं चल सका: {error}',
  muxTimeout: 'मर्ज का समय समाप्त, ffmpeg जवाब नहीं दे रहा'
} satisfies Messages['download']
