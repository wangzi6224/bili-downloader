import type { Messages } from '../types'

// MCP 批次状态里给 AI 的下一步提示
export default {
  expanding: 'वीडियो के पार्ट लाकर हिस्सों में कतार में जोड़े जा रहे हैं ({done}/{total}); जो जुड़ चुके हैं उनका डाउनलोड पहले शुरू हो जाता है; wait_seconds के साथ इंतज़ार कर सकते हैं',
  interruptedError: {
    one: 'वीडियो के पार्ट लाते समय त्रुटि हुई ({error}) और प्रक्रिया रुक गई; {count} आइटम अभी कतार में नहीं जुड़ा है; थोड़ी देर बाद control_tasks action=resume batch_id={id} बुलाकर जारी रखें',
    other: 'वीडियो के पार्ट लाते समय त्रुटि हुई ({error}) और प्रक्रिया रुक गई; {count} आइटम अभी कतार में नहीं जुड़े हैं; थोड़ी देर बाद control_tasks action=resume batch_id={id} बुलाकर जारी रखें'
  },
  interruptedQuit: {
    one: 'ऐप बंद होते समय {count} आइटम कतार में नहीं जुड़ा था; control_tasks action=resume batch_id={id} बुलाकर जारी रखें',
    other: 'ऐप बंद होते समय {count} आइटम कतार में नहीं जुड़े थे; control_tasks action=resume batch_id={id} बुलाकर जारी रखें'
  },
  waitingAuth: 'लॉग इन अब मान्य नहीं है; फिर से लॉग इन करने पर अपने-आप जारी रहेगा। {loginHint}',
  retrying: 'डाउनलोड जारी है; {count} कार्य त्रुटि के बाद अपने-आप दोबारा कोशिश का इंतज़ार कर रहे हैं; wait_seconds के साथ इंतज़ार कर सकते हैं',
  downloading: 'डाउनलोड जारी है; wait_seconds के साथ इंतज़ार कर सकते हैं',
  paused: {
    one: '{count} कार्य रुका हुआ है (ऐप रीस्टार्ट होने पर अधूरे कार्य अपने-आप रुक जाते हैं); control_tasks action=resume batch_id={id} बुलाकर जारी रखें',
    other: '{count} कार्य रुके हुए हैं (ऐप रीस्टार्ट होने पर अधूरे कार्य अपने-आप रुक जाते हैं); control_tasks action=resume batch_id={id} बुलाकर जारी रखें'
  },
  retryFailed: 'विफल कार्यों को दोबारा चलाने के लिए control_tasks action=retry batch_id={id} बुलाएँ',
  unsupported: 'जो डाउनलोड नहीं हो सकते (unsupported), उनके लिए ज़्यादातर Bilibili Premium ज़रूरी है, क्षेत्रीय प्रतिबंध है या वे पेड कंटेंट हैं; दोबारा कोशिश से कोई फ़ायदा नहीं',
  allDownloaded: 'चुने गए सभी आइटम पहले ही डाउनलोड हो चुके हैं'
} satisfies Messages['mcpBatch']
