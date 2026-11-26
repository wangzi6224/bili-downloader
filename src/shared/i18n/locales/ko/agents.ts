export default {
  group: 'AI 어시스턴트',
  groupHint: '자주 쓰는 AI 어시스턴트에 Bili Downloader를 추가합니다. 설치하면 어떤 대화에서든 “이 빌리빌리 영상 다운로드해 줘”, “빌리빌리에서 … 검색해 줘”라고 하면 Bili Downloader로 처리합니다. 앱을 업데이트하면 자동으로 함께 업데이트됩니다.',
  installAll: '원클릭 설정',
  installAllButton: '모두 설치({count})',
  installedAll: 'AI 어시스턴트 {count}개에 설치했습니다. 다시 시작하면 적용됩니다',
  install: '설치',
  update: '업데이트',
  uninstall: '제거',
  installAnyway: '그래도 설치',
  forceConfirm: '이 컴퓨터에서 {name}을(를) 찾지 못했습니다. 다른 위치에 설치되어 있다면 그대로 설치할 수 있으며, 설정은 다음 위치에 기록됩니다: {file}',
  installed: '{name}에 설치했습니다',
  installedRestart: '{name}에 설치했습니다. {name}을(를) 다시 시작하면 적용됩니다',
  installedTrust: '{name}에 설치했습니다. {name}의 MCP 패널에서 “신뢰”를 누르면 사용할 수 있습니다',
  trustHint: '{name}의 MCP 패널에서 “신뢰”를 눌러야 사용할 수 있습니다',
  notDetectedHint: '이 컴퓨터에서 {name}을(를) 찾지 못함',
  uninstalled: '{name}에서 제거했습니다',
  withSkill: 'MCP 서비스와 skill',
  mcpOnly: 'MCP 서비스만(skill 미지원)',
  skillConflict: '같은 이름의 skill이 이미 있어 덮어쓰지 않았습니다',
  brokenHint: '설정 파일을 읽을 수 없어 변경하지 않았습니다: {file}',
  state_unsupported: '이 시스템에서 사용 불가',
  state_broken: '설정 오류',
  state_outdated: '업데이트 가능',
  state_installed: '설치됨',
  state_notDetected: '감지되지 않음',
  state_available: '설치 가능',
  unknown: '알 수 없는 AI 어시스턴트: {id}',
  unsupported: '{name}은(는) 이 시스템을 지원하지 않습니다',
  configBroken: '{name}의 설정 파일을 읽을 수 없어 손상되지 않도록 변경하지 않았습니다: {file}. 파일 내용을 확인하거나 “AI 클라이언트 연결”에서 설정을 복사해 직접 추가해 주세요.',

  skillIntro:
    '사용자가 빌리빌리(Bilibili / B站) 영상 다운로드나 빌리빌리 검색을 원하거나, 빌리빌리 링크나 BV 번호를 주면 {appName}의 MCP 도구(서버 이름 bili-downloader)를 사용합니다. 직접 크롤러를 작성하거나 다른 다운로드 도구로 바꾸지 마세요. ' +
    '{appName}은(는) 사용자 컴퓨터의 데스크톱 앱이며, 파일은 앱에서 설정한 다운로드 폴더에 저장됩니다.',
  skillWorkflow: '사용 절차',
  skillSearch: '영상 고르기',
  skillSearchBody:
    '- 사용자가 “가장 좋은 / 볼 만한 / 추천” 영상을 원할 때: 빌리빌리 기본 종합 순위만 보지 말고 먼저 search_videos를 order=quality로 호출합니다(필요하면 duration이나 published_after로 범위를 좁힙니다).\n' +
    '- 점수가 높은 상위 3~5개는 get_video_transcript로 AI 요약을, get_video_comments로 댓글 반응을 확인하고(필요하면 get_video_info로 전체 수치도), 내용이 맞고 낚시 제목이 아닌지 확인한 뒤 추천 영상과 조회수·반응 수치, 이유를 사용자에게 알려 줍니다.\n' +
    '- 키워드가 너무 넓으면 좁히거나 duration, published_after로 거릅니다. quality는 후보 풀(기본 50개) 안에서만 다시 정렬하며 사이트 전체 순위가 아닙니다. 후보가 더 필요하면 pool을 늘리세요.\n' +
    '- 사용자가 “가장 인기 / 최신 / 가장 토론이 많은 / 탄막이 많은 / 가장 자세한 / 가볍게 볼 수 있는”이라고 하면 search_videos의 order 매개변수 설명에 따라 알맞은 정렬을 고릅니다.\n' +
    '- 사용자가 영상을 찾기만 원하면 추천과 이유를 알려 준 뒤 다운로드할지 묻습니다. 이미 다운로드를 요청했다면 점수가 가장 높은 영상(또는 지정한 영상)을 download_batch로 다운로드합니다. 검색이 요청 제한에 걸리면 몇 분 기다리고 연속으로 재시도하지 마세요.',
  skillTroubleshoot: '도구를 쓸 수 없을 때',
  skillTroubleshootBody:
    '- 앱이 실행 중이 아니라는 오류: 도구가 {appName}을(를) 백그라운드에서 자동으로 엽니다. 몇 초 기다린 뒤 다시 시도하고, 그래도 안 되면 사용자에게 {appName}을(를) 직접 열어 달라고 합니다.\n' +
    '- MCP 서비스가 꺼져 있다는 오류: 사용자에게 {appName} > 설정 > AI 어시스턴트에서 “MCP 서비스 켜기”를 켜 달라고 합니다.\n' +
    '- bili-downloader 도구가 아예 보이지 않음: 사용자에게 {appName} > 설정 > AI 어시스턴트에서 지금 쓰는 AI 어시스턴트의 “설치”를 누르고 다시 시작해 달라고 합니다.',
  ytSkillIntro: '{appName}(이 컴퓨터에서 실행)으로 YouTube 영상, Shorts, 재생목록, 채널, YouTube Music을 다운로드하고, 영상 검색과 자막·댓글 읽기도 합니다. 앱이 열려 있고 “설정 → AI 어시스턴트”에서 서비스가 켜져 있어야 합니다. YouTube를 처음 사용할 때 YouTube 구성 요소(yt-dlp)가 자동으로 다운로드됩니다.',
  ytSkillTroubleshootBody: '- 구성 요소 업데이트가 필요하다고 나옴: youtube_update_engine을 호출합니다.\n- 로봇이 아닌지 확인을 요구하거나 회원 전용 / 연령 제한 영상을 받을 수 없음: youtube_start_login으로 YouTube 로그인을 가져옵니다. 브라우저를 읽을 때 시스템이 권한을 요청할 수 있으니 사용자에게 허용해 달라고 합니다.\n- 중국 본토에서는 YouTube에 접속하려면 프록시가 필요합니다: 사용자에게 앱의 “설정 → 네트워크 및 고급”에서 프록시를 설정해 달라고 합니다(HTTP와 SOCKS 지원).\n- 자동 번역 자막은 YouTube가 요청을 자주 제한하므로, 받을 수 없으면 잠시 후 다시 시도하거나 직접 만든 자막으로 바꿉니다.',
  dySkillIntro: '이 컴퓨터의 {appName}로 Douyin 동영상, 사진 게시물, 모음, 크리에이터 게시물을 받고 검색, 상세 정보, 댓글을 볼 수 있습니다. 앱을 열고 “설정 → AI 도우미”에서 서비스를 켜야 합니다. Douyin에는 자막과 AI 요약이 없습니다.',
  dySkillTroubleshootBody: '- VERIFY_REQUIRED: douyin_open_verification을 호출해 사용자가 창에서 인증하게 하고 반복 재시도하지 마세요.\n- RATE_LIMITED: 몇 분 기다리세요.\n- 로그인이 필요하면 douyin_start_login으로 QR 코드를 스캔하게 하세요.\n- 대량 작업은 인증이 쉽게 발생하니 적당히 제출하세요.'
}
