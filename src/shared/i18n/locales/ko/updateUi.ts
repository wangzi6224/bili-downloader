import type { Messages } from '../types'

export default {
  skipVersion: '이 버전 건너뛰기',
  notNow: '나중에',
  openDownloadPage: '다운로드 페이지로 이동',
  downloadAndInstall: '다운로드 및 설치',
  cancelDownload: '다운로드 취소',
  downloadInBackground: '백그라운드에서 다운로드',
  restartAndInstall: '다시 시작하여 설치',
  installingButton: '설치 중…',
  retry: '다시 시도',
  title: '새 버전 {version}이(가) 있습니다',
  currentVersion: '현재 버전 {version}',
  releasedOn: '{date} 출시',
  packageSize: '설치 파일 {size}',
  noNotes: '이 버전에는 업데이트 내용이 작성되지 않았습니다.',
  blocker: '{blocker}. 또는 다운로드 페이지에서 직접 설치하세요.',
  skipped: '이전에 이 버전을 건너뛰었으므로 자동 확인 시 다시 알리지 않습니다.',
  downloading: '다운로드 중… 창을 닫아도 계속됩니다',
  pendingTasks: '아직 완료되지 않은 작업이 {count}개 있습니다. 다시 시작하면 일시 정지되며 업데이트 후 이어서 진행할 수 있습니다.',
  ready: '새 버전을 다운로드하고 검증했습니다. 다시 시작하면 바로 사용할 수 있습니다.',
  installing: '설치 중입니다. 앱이 곧 자동으로 다시 열립니다…'
} satisfies Messages['updateUi']
