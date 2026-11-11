import type { Messages } from '../types'

export default {
  ok: '확인',
  cancel: '취소',
  logoutMessage: '로그아웃할까요?',
  logoutDetail: '로그아웃하면 다시 가져오거나 로그인해야 합니다.',
  logoutConfirm: '로그아웃',
  upToDate: '최신 버전입니다',
  currentVersion: '현재 버전 {version}',
  quitPending: '아직 완료되지 않은 작업이 {count}개 있습니다. 종료할까요?',
  quitPendingDetail:
    '다운로드가 끝나지 않은 작업은 일시 정지되며, 다음에 열었을 때 ‘모두 계속’을 클릭하면 이어서 다운로드합니다. 이미 다운로드한 부분은 사라지지 않습니다. 워터마크를 제거하던 영상은 원래대로 유지됩니다.',
  runInBackground: '백그라운드에서 실행',
  quit: '종료',
  closeBrowserMessage: '빌리빌리 로그인 정보를 가져오기 위해 {browser}을(를) 닫을까요?',
  closeBrowserRequest: 'AI 어시스턴트가 빌리빌리 로그인 정보 가져오기를 요청했지만, {browser}이(가) 실행 중이라 데이터를 읽을 수 없습니다.',
  closeBrowserRisk: '닫으면 저장하지 않은 내용이 사라질 수 있습니다. {browser}이(가) 제때 종료되지 않으면 강제로 종료됩니다.',
  closeBrowserAppBound: '{browser}은(는) 앱 바인딩 암호화를 사용하므로 닫아도 로그인 정보를 읽지 못할 수 있습니다.',
  closeBrowserUnknown: '{browser}에 빌리빌리 로그인 정보가 있는지 아직 확실하지 않습니다.',
  closeBrowserConfirm: '{browser} 닫고 가져오기',
  useQrInstead: 'QR 코드로 로그인',
  loginWindowTitle: '빌리빌리 로그인',
  chooseDownloadDir: '다운로드 폴더 선택'
} satisfies Messages['dialogs']
