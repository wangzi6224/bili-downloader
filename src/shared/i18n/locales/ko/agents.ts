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
  skillTroubleshoot: '도구를 쓸 수 없을 때',
  skillTroubleshootBody:
    '- 앱이 실행 중이 아니라는 오류: 도구가 {appName}을(를) 백그라운드에서 자동으로 엽니다. 몇 초 기다린 뒤 다시 시도하고, 그래도 안 되면 사용자에게 {appName}을(를) 직접 열어 달라고 합니다.\n' +
    '- MCP 서비스가 꺼져 있다는 오류: 사용자에게 {appName} > 설정 > AI 어시스턴트에서 “MCP 서비스 켜기”를 켜 달라고 합니다.\n' +
    '- bili-downloader 도구가 아예 보이지 않음: 사용자에게 {appName} > 설정 > AI 어시스턴트에서 지금 쓰는 AI 어시스턴트의 “설치”를 누르고 다시 시작해 달라고 합니다.'
}
