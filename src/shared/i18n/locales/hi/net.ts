import type { Messages } from '../types'

export default {
  cdnAliyun: 'Alibaba Cloud',
  cdnTencent: 'Tencent Cloud',
  cdnHuawei: 'Huawei Cloud',
  cdnAliyunOverseas: 'Alibaba Cloud (विदेश)',
  cdnTencentOverseas: 'Tencent Cloud (विदेश)',
  cdnAkamaiOverseas: 'Akamai (विदेश)',
  direct: 'सीधा कनेक्शन',
  via: '{url} के ज़रिए कनेक्ट',
  systemNoProxy: 'सिस्टम के अनुसार (सिस्टम में प्रॉक्सी सेट नहीं है, सीधा कनेक्शन)',
  proxyInvalid: 'प्रॉक्सी सेटिंग ग़लत है, सीधे कनेक्शन पर बदल दिया गया: {reason}',
  proxyRequired: 'कृपया प्रॉक्सी पता डालें, जैसे http://127.0.0.1:7890',
  proxyBadFormat: 'प्रॉक्सी पते का फ़ॉर्मेट ग़लत है: {url}',
  socksUnsupported: 'SOCKS प्रॉक्सी अभी समर्थित नहीं है, कृपया HTTP प्रॉक्सी पोर्ट इस्तेमाल करें',
  protocolUnsupported: 'असमर्थित प्रॉक्सी प्रोटोकॉल: {protocol}',
  portRequired: 'प्रॉक्सी पते में पोर्ट होना चाहिए, जैसे http://127.0.0.1:7890',
  systemSocks: 'सिस्टम प्रॉक्सी SOCKS प्रकार की है, जो अभी समर्थित नहीं है; कृपया HTTP प्रॉक्सी पोर्ट मैन्युअली डालें'
} satisfies Messages['net']
