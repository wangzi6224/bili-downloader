import type { Messages } from '../types'

export default {
  diskFull: '디스크 공간이 부족합니다',
  atPath: ': {path}',
  noWritePermission: '쓰기 권한이 없습니다{where}',
  readOnlyDisk: '대상 디스크가 읽기 전용입니다{where}',
  dirMissing: '다운로드 폴더가 없거나 외장 디스크 연결이 끊겼습니다{where}',
  writeFailed: '파일 쓰기 실패({code}){where}',

  coverFailed: '표지 다운로드 실패: {error}',
  noCcSubtitle: 'CC 자막이 없습니다',
  subtitleFailed: '자막/챕터 가져오기 실패: {error}',
  danmakuFailed: '탄막 다운로드 실패: {error}',
  coverSaveFailed: '표지 저장 실패: {error}',
  subtitleSaveFailed: '자막 저장 실패: {error}',
  danmakuSaveFailed: '탄막 저장 실패: {error}',
  nfoSaveFailed: 'NFO 저장 실패: {error}',
  embedFallback: '표지/자막/챕터를 영상에 포함하지 못해 별도 파일로 저장했습니다',

  sizeFailed: '파일 크기를 가져오지 못했습니다(HTTP {status})',
  connectFailed: '다운로드 서버에 연결하지 못했습니다: {error}',
  timeout: '연결 시간 초과',
  httpFailed: '다운로드 실패(HTTP {status})',
  badRange: '서버가 반환한 데이터 범위가 올바르지 않습니다',
  interrupted: '연결이 끊겼습니다',
  incomplete: '파일이 불완전합니다({done}/{total})',

  deleteFailed: '파일 {count}개를 삭제하지 못했습니다: {files}',
  busy: '이 영상은 처리 중입니다. 끝날 때까지 기다려 주세요',
  badRegion: '워터마크 영역이 올바르지 않습니다',
  fileLocked: '원본 영상을 다른 프로그램이 사용 중이라 대체하지 못했습니다',

  actionMux: '병합',
  actionWatermark: '워터마크 제거',
  actionRead: '영상 읽기',
  ffNoSpace: '{action} 실패: 디스크 공간이 부족합니다',
  ffNoPermission: '{action} 실패: 대상 폴더에 쓸 권한이 없습니다',
  ffLogoOutside: '{action} 실패: 워터마크 위치가 화면을 벗어났습니다',
  ffEncoder: '{action} 실패: 인코더를 사용할 수 없습니다',
  ffCorrupt: '{action} 실패: 다운로드한 파일이 손상되었습니다. ‘다시 다운로드’를 클릭하세요',
  ffContainer: '병합 실패: 이 코덱은 현재 컨테이너 형식에 넣을 수 없습니다. 설정에서 MKV로 바꾸세요',
  ffExit: '{action} 실패(ffmpeg 종료 코드 {code}): {detail}',
  ffSpawn: 'ffmpeg를 실행할 수 없습니다: {error}',
  muxTimeout: '병합 시간 초과, ffmpeg가 응답하지 않습니다'
} satisfies Messages['download']
