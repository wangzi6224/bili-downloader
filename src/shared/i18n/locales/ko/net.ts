import type { Messages } from '../types'

export default {
  cdnAliyun: '알리바바 클라우드',
  cdnTencent: '텐센트 클라우드',
  cdnHuawei: '화웨이 클라우드',
  cdnAliyunOverseas: '알리바바 클라우드 (해외)',
  cdnTencentOverseas: '텐센트 클라우드 (해외)',
  cdnAkamaiOverseas: 'Akamai (해외)',
  direct: '직접 연결',
  via: '{url}을(를) 통해 연결',
  systemNoProxy: '시스템 설정 따르기(시스템에 프록시가 설정되지 않아 직접 연결)',
  proxyInvalid: '프록시 설정이 잘못되어 직접 연결로 바꿨습니다: {reason}',
  proxyRequired: '프록시 주소를 입력하세요. 예: http://127.0.0.1:7890',
  proxyBadFormat: '프록시 주소 형식이 잘못되었습니다: {url}',
  socksUnsupported: 'SOCKS 프록시는 아직 지원하지 않습니다. HTTP 프록시 포트를 사용하세요',
  protocolUnsupported: '지원하지 않는 프록시 프로토콜입니다: {protocol}',
  portRequired: '프록시 주소에 포트가 있어야 합니다. 예: http://127.0.0.1:7890',
  systemSocks: '시스템 프록시가 SOCKS 유형이라 아직 지원하지 않습니다. 직접 설정에서 HTTP 프록시 포트를 입력하세요'
} satisfies Messages['net']
