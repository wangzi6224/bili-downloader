import type { Messages } from '../types'

export default {
  vipDefault: '프리미엄',
  notifyDoneTitle: '다운로드 완료',
  notifyDoneBody: '작업 {count}개가 모두 완료되었습니다',
  notifyFailedTitle: '다운로드가 끝났지만 실패한 작업이 있습니다',
  notifyFailedBody: '{done}개 완료, {failed}개 실패',
  notifySubsTitle: '구독에 새 콘텐츠가 있습니다',
  notifySubsBody: '‘{title}’에 새 콘텐츠 {count}개가 있어 다운로드에 추가했습니다',
  fetchingParts: '영상 파트를 가져오는 중',
  partsUnavailable: '영상 {count}개를 가져올 수 없습니다({reason})'
} satisfies Messages['misc']
