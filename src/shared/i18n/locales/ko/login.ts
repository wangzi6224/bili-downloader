import type { Messages } from '../types'

export default {
  windowClosedNotLoggedIn: '로그인을 완료하기 전에 로그인 창이 닫혔습니다',
  expiredTitle: '빌리빌리 로그인이 만료되었습니다',
  title: '빌리빌리 계정으로 로그인',
  expiredSubtitle: '분석과 다운로드를 계속하려면 다시 로그인해야 합니다. 진행 중이던 다운로드는 로그인 후 자동으로 이어집니다.',
  subtitle: '본인 계정으로 다운로드해야 1080P 이상 화질과 빌리빌리 프리미엄 콘텐츠를 받을 수 있습니다.',
  fromBrowser: '브라우저에서 가져오기',
  redetect: '다시 감지',
  detecting: '브라우저를 찾는 중…',
  loggedIn: '빌리빌리에 로그인됨',
  cannotImport: '가져올 수 없음',
  importing: '가져오는 중',
  import: '가져오기',
  scanToLogin: 'QR 코드로 로그인',
  pasteManually: '직접 붙여넣기',
  appBoundBanner:
    '{browsers}은(는) 앱 바인딩 암호화로 로그인 정보를 보호하므로 브라우저 자신만 읽을 수 있고 이 앱에서는 가져올 수 없습니다. QR 코드로 로그인하거나 브라우저에서 쿠키를 복사해 직접 붙여넣으세요.',
  openSystemSettings: '시스템 설정 열기',
  macBlocked:
    'macOS에서 이 앱이 {browsers}의 데이터를 읽도록 허용하지 않습니다. 이 브라우저에서 가져오려면 ‘시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한’에서 이 앱을 켠 다음 앱을 다시 시작하세요. 아래의 앱 내 로그인을 바로 사용할 수도 있습니다.',
  blocked:
    '{browsers}의 데이터를 읽을 권한이 없습니다(현재 사용자는 브라우저 프로필 폴더를 읽을 수 없습니다). 아래의 앱 내 로그인을 바로 사용할 수 있습니다.',
  locked: '{browsers}이(가) 실행 중이라 로그인 정보를 읽을 수 없습니다. 브라우저를 완전히 종료한 다음(백그라운드 실행 포함) ‘다시 감지’를 클릭하세요.',
  lockedAppBound:
    '최신 버전의 Chrome과 Edge는 앱 바인딩 암호화로 로그인 정보를 보호하므로 종료해도 읽지 못할 가능성이 높습니다. QR 코드로 로그인하는 것을 권장합니다.',
  noBrowserLoggedIn: '찾은 브라우저 중 빌리빌리에 로그인된 브라우저가 없습니다',
  noBrowserFound: '지원되는 브라우저를 찾지 못했습니다',
  supported: ' ({browsers} 지원)',
  notLoggedInList: '빌리빌리에 로그인되지 않음: {list}',
  profileLabel: '{browser} ({profile})',
  inApp: '앱에서 로그인',
  inAppHint: 'QR 코드, 비밀번호, SMS 로그인을 지원하며 로그인에 성공하면 창이 자동으로 닫힙니다',
  waitingLogin: '로그인 완료를 기다리는 중',
  openLoginPage: '로그인 페이지 열기',
  pasteCookie: '쿠키 직접 붙여넣기',
  pasteHint:
    '“SESSDATA=…; bili_jct=…; DedeUserID=…” 형식의 내용이나 Cookie-Editor 같은 확장 프로그램에서 내보낸 JSON을 붙여넣으세요. 쿠키는 로그인 자격 증명과 같으며 이 컴퓨터에만 저장됩니다.',
  pasteStep1: '브라우저에서 bilibili.com을 열고 로그인되어 있는지 확인합니다.',
  pasteStep2: 'F12를 눌러 개발자 도구를 열고 ‘애플리케이션’(Application) → 쿠키 → https://www.bilibili.com으로 이동합니다.',
  pasteStep3: 'SESSDATA, bili_jct, DedeUserID 값을 차례로 복사해 위 형식대로 이어 붙여넣습니다.',
  verifying: '확인 중…',
  loginWithCookie: '이 쿠키로 로그인'
} satisfies Messages['login']
