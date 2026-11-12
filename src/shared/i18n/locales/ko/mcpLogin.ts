import type { Messages } from '../types'

export default {
  startTitle: '빌리빌리 로그인',
  startDesc:
    '빌리빌리 계정에 로그인합니다. 기본적으로 사용자 브라우저의 로그인 정보를 가져옵니다. Chrome, 기타 Chrome 계열, Opera, Firefox, Safari 순서로 바로 읽을 수 있는 것을 먼저 사용합니다. 쿠키는 앱에만 저장되며 결과에는 포함되지 않습니다. ' +
    '가져오기에 실패하면 반환된 next에 따라 진행하세요. next=try_qr이면 사용자에게 알린 뒤 method=qr로 QR 코드 로그인 창을 띄우고, get_login_status에 wait_seconds를 붙여 로그인 완료를 기다립니다. ' +
    '기본 모드에서 현재 계정이 로그인되어 있으면 상태를 즉시 반환합니다. 브라우저를 닫아야 할 때는 앱이 팝업으로 사용자 본인에게 묻고, 여기에는 브라우저를 바로 닫는 매개변수가 없습니다.',
  startMethod: 'browser 브라우저에서 가져오기(기본값), qr 로그인 창을 띄워 사용자가 QR 코드를 스캔',
  startSource: '브라우저 지정. 예: chrome, edge, opera, firefox, safari 또는 get_login_status가 나열한 프로필 id. 전달하지 않으면 자동으로 선택합니다',
  startWait: '최대 몇 초 기다릴지. 기본값 {n}. 로그인이 완료되거나, 실패하거나, 사용자 조작이 필요하면 즉시 반환합니다',

  statusTitle: '로그인 진행 상황 확인',
  statusDesc:
    'start_login의 진행 상황을 확인합니다. wait_seconds가 0보다 크면 로그인 성공, 실패 또는 상태 변화가 있을 때까지 기다렸다가 반환합니다. 로그인에 성공하는 순간 즉시 반환되며, 이것이 QR 코드 스캔 완료 알림입니다. 반복해서 조회하는 것보다 편합니다. ' +
    '사용자가 앱에서 직접 로그인한 경우도 포함됩니다. 시간이 초과되어도 waiting_user이면 다시 호출하세요. include_browsers=true이면 이 컴퓨터의 브라우저와 각 브라우저에 빌리빌리 로그인이 있는지 나열합니다.',
  statusWait: '최대 몇 초 기다릴지. 기본값 0',
  statusBrowsers: '이 컴퓨터의 브라우저를 나열할지 여부. 기본값 false',

  hintLocked: '브라우저가 실행 중입니다. 사용자에게 브라우저를 완전히 종료(백그라운드 실행 포함)한 뒤 다시 시도하도록 하거나 QR 코드 로그인을 사용하세요',
  hintAppBound: '이 브라우저는 앱 바인딩 암호화로 로그인 정보를 보호하므로 읽을 수 없습니다. QR 코드 로그인을 사용하세요',
  hintBlocked: 'macOS에서는 {appName} 로그인 창에서 브라우저 폴더를 선택하세요. 다른 시스템에서는 폴더 권한을 확인하세요. QR 코드로 로그인할 수도 있습니다.',
  hintNoLogin: '브라우저에 빌리빌리 로그인이 없습니다. 사용자가 방금 브라우저에서 로그인했다면 30초쯤 기다린 뒤 다시 시도하거나(브라우저가 바로 기록하지 않음) QR 코드 로그인을 사용하세요',
  hintExpired: '브라우저의 빌리빌리 로그인이 만료되었습니다. QR 코드 로그인을 사용하거나 사용자에게 먼저 브라우저에서 다시 로그인하도록 하세요',
  hintKeychainDenied: '사용자가 키체인 팝업에서 ‘허용’을 클릭하지 않았습니다. 다시 시도할지 사용자에게 묻거나 QR 코드 로그인을 사용하세요',
  hintNetwork: '빌리빌리에 연결할 수 없거나 요청 제한에 막혔습니다. 잠시 후 다시 시도하세요',
  hintDeclined: '사용자가 브라우저 닫기에 동의하지 않았으므로 반복해서 재시도하지 마세요. start_login method=qr로 QR 코드 로그인을 할지 사용자에게 물어보세요',
  hintConfirmTimeout: '사용자가 대화 상자에 응답하지 않았습니다. 보지 못했을 수 있습니다. 사용자에게 확인하도록 알린 뒤 다시 시도하거나 QR 코드 로그인을 사용하세요',
  hintCloseFailed: '브라우저를 닫지 못했습니다. 사용자에게 직접 종료한 뒤 다시 시도하도록 하거나 QR 코드 로그인을 사용하세요',
  hintWindowClosed: '사용자가 로그인 창을 닫았습니다. 다시 열지 사용자에게 물어보세요',
  hintNotFound: 'get_login_status include_browsers=true로 이 컴퓨터의 브라우저를 확인하거나 QR 코드 로그인을 사용하세요',
  hintFailed: '다른 브라우저를 사용하거나 QR 코드 로그인을 사용하세요',

  stepChecking: '로그인 상태를 확인하는 중입니다. get_login_status wait_seconds=30으로 결과를 기다리세요',
  stepImporting: '브라우저의 로그인 정보를 읽는 중입니다. macOS에서는 키체인 접근 허용 팝업이, Linux에서는 키링 잠금 해제 창이 뜰 수 있으니 사용자에게 ‘허용’을 클릭하도록 알려 주세요. get_login_status wait_seconds=30으로 결과를 기다리세요',
  stepConfirmClose: '앱에서 브라우저를 닫을지 묻는 대화 상자를 띄웠습니다. 사용자에게 응답하도록 알려 주세요. get_login_status wait_seconds=30으로 결과를 기다리세요',
  stepClosingBrowser: '사용자가 동의하여 브라우저를 닫는 중입니다. get_login_status wait_seconds=30으로 결과를 기다리세요',
  stepQr: '로그인 창이 열렸습니다. 사용자에게 빌리빌리 앱으로 QR 코드를 스캔하도록 알려 주세요. get_login_status wait_seconds=50으로 결과를 기다리세요. 로그인에 성공하면 즉시 반환되며, 시간이 초과되면 다시 호출하세요',

  interrupted: '이 배치들은 이전에 중단되었습니다. control_tasks action=resume batch_id=…로 계속하세요',

  qrClosed: '로그인을 완료하기 전에 로그인 창이 닫혔습니다',
  sourceNotFound: '‘{source}’을(를) 찾지 못했습니다. get_login_status include_browsers=true로 이 컴퓨터의 브라우저를 확인할 수 있습니다',
  appBoundLogin: '{browser}의 빌리빌리 로그인은 앱 바인딩 암호화로 저장되어 브라우저 자신만 읽을 수 있습니다. QR 코드 로그인을 사용하세요',
  appBoundLocked: '{browser}은(는) 앱 바인딩 암호화를 사용하므로 종료해도 로그인 정보를 읽지 못할 가능성이 높습니다',
  browserRunning: '{browser}이(가) 실행 중입니다. 사용자가 직접 종료한 뒤 가져와야 합니다',
  noPermission: '{browser}의 데이터를 읽을 권한이 없습니다',
  noLoginIn: '{browser}에 빌리빌리 로그인 정보가 없습니다',
  noBrowser: '지원되는 브라우저를 찾지 못했습니다',
  noLoginReadable: '읽을 수 있는 브라우저 중 빌리빌리 로그인 정보가 있는 브라우저가 없으며, {browser}은(는) 읽기 권한이 없습니다',
  noLoginAny: '찾은 브라우저 중 빌리빌리 로그인 정보가 있는 브라우저가 없습니다',
  confirmTimeout: '사용자가 {browser}을(를) 닫을지 묻는 대화 상자에 응답하지 않았습니다',
  declined: '사용자가 {browser} 닫기에 동의하지 않았습니다',
  closeFailed: '{browser}을(를) 닫지 못했습니다',
  closedNoLogin: '{browser}을(를) 닫았지만 빌리빌리 로그인 정보가 없습니다'
} satisfies Messages['mcpLogin']
