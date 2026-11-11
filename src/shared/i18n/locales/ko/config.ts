import type { Messages } from '../types'

export default {
  exportTitle: '설정 내보내기',
  importTitle: '설정 가져오기',
  exported: '{path}(으)로 내보냈습니다',
  invalidJson: '이 파일은 올바른 JSON이 아닙니다',
  notOurs: '이 앱에서 내보낸 설정 파일이 아닙니다',
  imported: '설정과 구독 {count}개를 가져왔습니다({app}에서 {date}에 내보냄)',
  namingInvalid: '이름 템플릿이 잘못되었습니다: {reason}'
} satisfies Messages['config']
