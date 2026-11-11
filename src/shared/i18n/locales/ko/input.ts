import type { Messages } from '../types'

export default {
  separator: '; ',
  parseFailures: '링크 {count}개 분석 실패: {errors}',
  watchLater: '나중에 보기',
  popular: '인기',
  weekly: '주간 필수 시청(최신 회차)',
  rank: '{name} 랭킹',
  myFavorites: '내 즐겨찾기 폴더',
  loading: '불러오는 중…',
  noFavorites: '즐겨찾기 폴더가 없습니다',
  myMenu: '나중에 보기, 인기, 내 즐겨찾기 폴더',
  myMenuLoggedOut: '로그인 후 사용 가능: 나중에 보기, 인기, 내 즐겨찾기 폴더',
  batchTitle: '일괄 분석',
  batchSubtitle: '한 줄에 링크 하나씩 입력하세요(BV 번호, 애니메이션, 즐겨찾기 폴더, 업로더 모두 가능). 하나씩 분석한 뒤 한데 모아 선택합니다.',
  detectedLinks: '링크 {count}개 감지됨',
  cancel: '취소',
  parseCount: '{count}개 분석',
  placeholder: '영상, 컬렉션, 애니메이션, 강의, 즐겨찾기 폴더 또는 업로더 링크를 붙여넣으세요',
  pasteAndParse: '클립보드에서 붙여넣고 분석',
  parsing: '분석 중',
  parse: '분석',
  batchButton: '일괄 분석: 여러 줄의 링크를 한 번에 붙여넣기',
  parsingProgress: '분석 중 {done}/{total}',
  clipboardLinks: '클립보드에 링크가 {count}개 있습니다',
  clipboardLink: '클립보드에서 링크를 감지했습니다'
} satisfies Messages['input']
