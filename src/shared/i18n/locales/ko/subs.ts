import type { Messages } from '../types'

export default {
  interval30m: '30분',
  interval1h: '1시간',
  interval3h: '3시간',
  interval6h: '6시간',
  interval12h: '12시간',
  interval1d: '1일',
  everyInterval: '{interval}마다',
  title: '구독',
  subtitle: '앱이 실행 중일 때 정해진 간격으로 즐겨찾기 폴더, 컬렉션, 애니메이션, 업로더 등을 확인하고, 새 콘텐츠가 있으면 구독할 때의 옵션으로 자동 다운로드합니다.',
  empty: '아직 구독이 없습니다',
  emptyHint: '즐겨찾기 폴더, 컬렉션, 애니메이션 또는 업로더 페이지를 분석한 뒤 선택 창 아래쪽의 ‘업데이트 구독’을 클릭하면 추가됩니다.',
  enabled: '사용 중',
  disabled: '사용 안 함',
  lastNew: '지난번에 새 콘텐츠 {count}개 발견',
  checking: '확인 중…',
  checkNow: '지금 확인',
  unsubscribe: '구독 취소',
  unsubscribeConfirm: '‘{title}’ 구독을 취소할까요?'
} satisfies Messages['subs']
