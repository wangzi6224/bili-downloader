import type { Messages } from '../types'

export default {
  title: '창 닫기',
  subtitle: '백그라운드에서 실행하면 다운로드와 구독 확인이 계속되며, {reopenFrom}에서 창을 다시 열 수 있습니다.',
  pendingTasks: '아직 완료되지 않은 작업이 {count}개 있습니다. 완전히 종료하면 일시 정지되며 다음에 열었을 때 이어서 진행할 수 있습니다.',
  remember: '선택을 기억하고 다시 묻지 않기',
  rememberHint: '나중에 ‘설정 → 일반’에서 바꿀 수 있습니다',
  cancel: '취소',
  quit: '완전히 종료',
  background: '백그라운드에서 실행'
} satisfies Messages['closeDialog']
