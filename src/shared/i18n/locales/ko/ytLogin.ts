import type { Messages } from '../types'

export default {
  noLoginCookie: 'YouTube 로그인 정보를 찾지 못했습니다(SAPISID 없음). 브라우저에서 YouTube에 로그인되어 있는지 확인하세요',
  verifyFailed: 'YouTube 로그인을 확인하는 중 오류가 발생했습니다: {reason}',
  expired: '이 YouTube 로그인은 만료되었습니다. 브라우저에서 YouTube에 다시 로그인한 뒤 다시 가져오세요',
  accountNotFound: '이 YouTube 계정을 찾을 수 없습니다',
  noLoginInBrowser: '이 브라우저 프로필에는 YouTube 로그인 정보가 없습니다. 먼저 브라우저에서 YouTube에 로그인하세요'
} satisfies Messages['ytLogin']
