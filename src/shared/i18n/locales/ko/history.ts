import type { Messages } from '../types'

export default {
  title: '분석 기록',
  subtitle: '분석했던 링크가 모두 여기에 있습니다. 클릭하면 선택 창을 다시 열어 남은 편을 이어서 다운로드할 수 있습니다.',
  search: '제목 또는 링크 검색',
  clearConfirm: '분석 기록을 모두 지울까요?',
  clear: '지우기',
  empty: '아직 분석 기록이 없습니다',
  emptyHint: '다운로드 페이지에 링크를 붙여넣어 분석하면 여기에 자동으로 기록됩니다.',
  noMatch: '일치하는 기록이 없습니다',
  kindPgc: '애니메이션·영화·드라마',
  kindVideo: '영상',
  itemCount: '{count}개 항목',
  remove: '이 기록 삭제'
} satisfies Messages['history']
