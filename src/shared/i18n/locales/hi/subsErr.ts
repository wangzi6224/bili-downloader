import type { Messages } from '../types'

export default {
  duplicate: 'यह स्रोत पहले से सब्सक्राइब है',
  authExpired: 'लॉग इन अब मान्य नहीं है; फिर से लॉग इन करने के बाद जाँच जारी रहेगी'
} satisfies Messages['subsErr']
