import type { Messages } from '../types'

export default {
  qn: '화질 코드. 이 값을 넘지 않는 범위에서 사용 가능한 가장 높은 화질을 선택합니다: 127 최고 화질, 120 4K, 116 1080P60, 112 1080P+, 80 1080P, 64 720P, 32 480P, 16 360P',

  optOutput: '전체 영상 / 오디오만 / 영상만(소리 없음)',
  optContainer: '영상 컨테이너 형식',
  optAudio: '음질: best는 가장 좋은 음질을 자동 선택하며, 지정한 등급을 받을 수 없으면 등급을 낮춥니다',
  optCodecOrder: '영상 코덱 우선순위. 예: ["hevc","avc","av1"]',
  optSubtitle: '자막을 .srt로 따로 저장',
  optEmbedSubtitle: '자막을 영상 파일에 포함',
  optDanmaku: '탄막 다운로드',
  optDanmakuFormat: '탄막 형식',
  optCover: '표지를 이미지로 따로 저장',
  optEmbedCover: '표지를 영상 / 오디오 파일에 포함',
  optChapters: '진행 막대의 구간을 챕터로 기록',
  optNfo: 'Kodi / Jellyfin용 NFO 메타데이터 생성',
  optWatermark:
    '워터마크 제거: 다운로드 후 화면 모서리의 워터마크를 자동으로 감지해 제거합니다(영상을 다시 인코딩해야 하며, 감지되지 않았거나 HDR, 돌비 비전이면 원본 영상을 유지합니다). ' +
    'auto는 빠른 제거(보간으로 채우며 몇 분 안에 끝나지만 워터마크 부분이 약간 흐려짐), ai는 AI 모델로 프레임마다 보정하여 훨씬 선명하지만 훨씬 느립니다' +
    '(그래픽 카드가 있으면 영상 길이의 약 2~4배, 없으면 더 느림. 처음에는 약 200MB의 모델을 먼저 다운로드하며, 다운로드하지 못하면 빠른 제거를 사용). ' +
    'off여도 워터마크 유무는 감지하며, 결과는 get_batch_status의 watermark에 있고 이후 remove_watermark로 제거할 수 있습니다. 사용자가 워터마크 제거를 언급하지 않았다면 전달하지 않아도 됩니다',

  getStatusTitle: '앱 상태',
  getStatusDesc: '로그인 및 빌리빌리 프리미엄 상태, 다운로드 대기열 요약, 전체 속도, 다운로드 폴더와 남은 공간, 주요 설정, 그리고 주의해야 할 알림을 보여 줍니다. 가장 먼저 호출하는 것을 권장합니다.',

  parseLinkTitle: '링크 분석',
  parseLinkDesc:
    '빌리빌리 링크(영상, 컬렉션, 애니메이션, 강의, 즐겨찾기 폴더, 업로더 페이지, 나중에 보기 등)를 분석하며, 페이지가 나뉜 목록은 자동으로 페이지를 넘깁니다. ' +
    '항목이 많으면 offset / limit으로 나눠서 읽으며, 결과는 10분 동안 캐시됩니다. 항목의 id는 고정되어 있으며 download_batch의 ids에 전달합니다. ' +
    '목록 안의 영상(lazy)은 아직 파트가 펼쳐지지 않았습니다. 다운로드에 추가할 때 자동으로 펼쳐지며, 파트를 보거나 그중 일부 파트만 다운로드하려면 expand_parts를 전달하세요. ' +
    "lazy 영상의 downloaded='partly'는 적어도 한 파트를 다운로드했다는 뜻이며, 다운로드에 추가할 때 파트별로 확인합니다.",
  parseLinkUrl: '빌리빌리 링크, BV 번호, 또는 “稍后再看”(나중에 보기), “每周必看”(주간 필수 시청), “排行榜”(랭킹)',
  parseLinkMaxItems: '페이지를 넘기며 최대 몇 개까지 가져올지. 기본값 {n}',
  parseLinkOffset: '몇 번째 항목부터 반환할지. 기본값 0',
  parseLinkLimit: '몇 개를 반환할지. 기본값 100',
  parseLinkExpand: '이번에 반환하는 목록 영상의 파트를 펼칩니다(하나씩 요청하므로 느림). 이때 limit은 최대 {n}',
  parseLinkRefresh: '캐시를 무시하고 다시 분석',

  downloadTitle: '일괄 다운로드',
  downloadDesc:
    '링크 안의 항목을 하나의 배치로 다운로드 대기열에 추가하고 즉시 batch_id를 반환합니다. 목록 영상의 파트는 백그라운드에서 펼쳐집니다. ' +
    'ids로 항목을 고르거나 all=true로 모두 다운로드합니다. 단일 영상 링크라면 둘 다 전달하지 않아도 됩니다. ' +
    '다운로드할 영상이 서로 다른 링크에서 왔다면(예: 검색 결과) videos로 한 번에 제출하고, 하나씩 호출하지 마세요. 이미 다운로드한 항목은 기본적으로 건너뛰며, 이미 대기열에 있는 항목은 중복 추가되지 않습니다. ' +
    '원래 배치가 아직 끝나지 않았을 때 같은 요청을 다시 제출하면 원래 배치를 반환합니다(deduplicated=true). request_id를 전달하면 멱등성 키를 명시적으로 지정할 수 있습니다.',
  downloadUrl: 'parse_link에서 사용한 것과 같은 링크. videos와 함께 사용할 수 없습니다',
  downloadVideos:
    'BV 번호, av 번호, 영상 링크 또는 b23.tv 단축 링크(예: search_videos 결과의 url)를 하나의 배치로 묶습니다. 최대 {max}개이며, 그중 단축 링크와 av 번호는 최대 20개입니다. 각 영상은 모든 파트를 다운로드하며 링크의 p 매개변수는 적용되지 않습니다. 컬렉션, 즐겨찾기 폴더 같은 목록 링크는 url을 사용하세요',
  downloadBatchTitle: 'videos의 배치 이름이며, 영상이 여러 개일 때는 저장 폴더 이름이기도 합니다. 기본값: 영상이 하나면 그 제목, 여러 개면 “N개 영상”',
  downloadIds: 'parse_link가 반환한 항목 id(영상의 id는 그 영상의 모든 파트를 뜻함)',
  downloadAll: '모든 항목을 다운로드(최대 max_items개)',
  downloadMaxItems: 'all=true일 때 최대 몇 개까지 가져올지. 기본값 {n}. parse_link와 같으면 그 캐시를 그대로 사용합니다',
  downloadQn: '{qn}. 기본값은 설정의 화질',
  downloadOptions: '다운로드 옵션. 전달하지 않은 항목은 설정의 기본값을 사용합니다',
  downloadSubdir: '다운로드 폴더 아래의 이 하위 폴더에 저장',
  downloadSkip: '다운로드 기록에 이미 있는 항목 건너뛰기. 기본값 true',
  downloadRequestId: '멱등성 키: 같은 request_id로는 배치가 하나만 만들어집니다',

  batchStatusTitle: '배치 진행 상황',
  batchStatusDesc:
    '배치의 진행 상황을 확인합니다: 상태별 작업 수, 다운로드한 바이트, 속도, 예상 남은 시간, 실제 화질, 실패 원인과 다음 단계 안내. ' +
    'watermark는 워터마크 제거 상황입니다: 빌리빌리 워터마크가 감지된 영상 수, 제거된 수, 처리 중인 진행률, 그리고 워터마크가 있지만 아직 제거되지 않은 경우 두 방식에 각각 걸리는 시간(hint에 사용자에게 전할 문구가 있음). ' +
    'wait_seconds가 0보다 크면 배치가 모두 끝나거나, 일시 정지되거나, 조치가 필요해질 때까지 기다렸다가 반환하며(최대 그 시간만큼 대기), 워터마크 제거 중일 때도 기다립니다. 반복해서 조회하는 것보다 편합니다.',
  batchStatusWait: '최대 몇 초 기다릴지. 기본값 0',
  batchStatusInclude: '함께 반환할 세부 정보: failed 실패 목록(기본값), files 완료된 파일 경로, running 다운로드 중인 작업',

  listBatchesTitle: '최근 배치',
  listBatchesDesc: '최근에 제출한 배치(최신순). batch_id를 다시 찾을 때 사용합니다.',
  listBatchesLimit: '기본값 20',

  listTasksTitle: '작업 목록',
  listTasksDesc:
    '다운로드 작업을 페이지별로 확인하며, 배치, 상태, 제목으로 필터링할 수 있습니다. 상태: queued 대기 중, running 다운로드 중, paused 일시 정지, retrying 자동 재시도 대기 중, ' +
    'failed 실패, unsupported 다운로드 불가, waiting_auth 로그인 대기 중, done 완료. active는 아직 끝나지 않은 작업을 뜻합니다.',
  listTasksStatus: '하나 이상의 상태. 기본값 all',
  listTasksQuery: '제목에 포함된 텍스트',
  listTasksLimit: '기본값 50',
  listTasksFields: '이 필드만 반환',

  controlTitle: '작업 일괄 제어',
  controlDesc:
    '작업을 일괄로 일시 정지, 계속, 재시도, 다시 다운로드, 제거하거나 워터마크 제거를 취소합니다. task_ids, batch_id, status로 범위를 지정합니다(최소 하나, 조합 가능). ' +
    'batch_id만 지정하면(task_ids, status 없이) 배치 전체에 대해 작업합니다. pause / resume은 나중에 대기열에 추가되는 작업도 함께 일시 정지 / 계속하고, retry는 파트 펼치기에 실패한 항목도 다시 시도하며, remove는 아직 처리되지 않은 항목을 더 이상 추가하지 않습니다. ' +
    'redownload는 다운로드한 부분을 삭제하고 처음부터 다시 다운로드합니다. remove는 완료되지 않은 작업을 취소하고 작업을 목록에서 제거하며, 다운로드가 끝난 파일은 삭제하지 않습니다. ' +
    'cancel_watermark는 진행 중인 워터마크 제거(remove_watermark로 시작한 것)를 취소하며 원본 영상은 그대로 유지됩니다.',
  controlStatus: '이 상태의 작업만 대상으로 함',
  controlUnsupported: 'retry 시 ‘다운로드 불가’ 작업도 다시 시도(예: 방금 빌리빌리 프리미엄에 가입한 경우)',

  removeWmTitle: '워터마크 제거',
  removeWmDesc:
    '다운로드한 영상의 화면 모서리에 있는 빌리빌리 워터마크를 제거합니다. 백그라운드에서 진행되며 완료되면 원본 파일을 대체합니다(다시 인코딩함). 사용자가 명시적으로 요청하거나 동의한 경우에만 호출하세요. ' +
    'method=fast 빠른 제거: 주변 화면으로 채우며 워터마크 부분이 약간 흐려지고, 보통 영상 길이의 0.몇 배 정도만 걸립니다. ' +
    'method=ai AI 정밀 보정: 프레임마다 워터마크 아래의 화면을 복원하여 훨씬 선명하지만 훨씬 느립니다(그래픽 카드가 있으면 영상 길이의 약 2~4배). 처음에는 약 200MB의 모델을 먼저 다운로드하며, 다운로드하지 못하거나 정밀 보정에 실패하면 빠른 제거를 사용합니다. ' +
    'batch_id를 사용하면 이 배치에서 다운로드가 완료되고 워터마크가 감지되었으며 아직 제거되지 않은 영상을 처리합니다. task_ids를 사용하면 하나씩 감지합니다(다운로드할 때 감지하지 않은 영상은 하나에 몇 초씩 걸리며, 한 번에 최대 10개까지 감지). ' +
    '먼저 dry_run=true로 각 영상의 예상 소요 시간을 받아 사용자에게 알린 뒤 실제로 호출하세요. 진행 상황은 get_batch_status 또는 list_tasks의 watermark에서 확인하고, 취소는 control_tasks action=cancel_watermark로 합니다.',
  removeWmMethod: 'fast 빠른 제거, ai AI 정밀 보정',
  removeWmTaskIds: '처리할 작업(다운로드가 완료되어 있어야 함)',
  removeWmBatchId: '이 배치에서 워터마크가 감지되었고 아직 제거되지 않은 영상을 처리',
  removeWmRegion: '워터마크 위치를 직접 지정(영상 픽셀 좌표). task_id 하나와 함께만 사용할 수 있습니다. 위치를 인식하지 못하면 skipped에 영상 크기와 가능한 위치가 제공됩니다',
  removeWmForce: '이미 워터마크를 제거한 영상도 다시 처리(예: 빠른 제거 후 AI 정밀 보정으로 바꾸고 싶을 때)',
  removeWmDryRun: '감지와 소요 시간 추정만 하고 처리는 시작하지 않음',

  getSettingsTitle: '설정 읽기',
  getSettingsDesc: '다운로드 관련 설정을 읽습니다: 다운로드 폴더, 동시 다운로드 수, 파일당 스레드 수, 속도 제한, 자동 재시도 횟수, 기본 화질과 기본 다운로드 옵션.',

  updateSettingsTitle: '설정 변경',
  updateSettingsDesc: '다운로드 관련 설정을 변경하며, 바꿀 항목만 전달하면 됩니다. 변경된 설정과 각 항목이 언제 적용되는지를 반환합니다.',
  updateDownloadDir: '절대 경로(~/로 시작 가능). 없으면 만듭니다',
  updateConcurrency: '동시에 다운로드할 작업 수',
  updateThreads: '파일마다 동시에 몇 개의 연결로 나눠 받을지',
  updateSpeedLimit: '전체 속도 제한 KB/s, 0은 제한 없음',
  updateAutoRetry: '네트워크 오류 시 자동 재시도 횟수',
  updateDefaults: '기본 다운로드 옵션. 전달한 필드만 변경합니다',

  noSuchTool: '해당 도구가 없습니다: {name}',
  noSuchToolHint: 'tools/list로 사용 가능한 도구를 확인하세요',
  downloadDirAbsolute: 'download_dir은 절대 경로여야 합니다',
  downloadDirUnusable: '다운로드 폴더를 사용할 수 없습니다: {reason}',
  effectDownloadDir: '이후에 추가되는 작업에만 적용되며, 이미 대기열에 있는 작업은 원래 폴더에 저장됩니다',
  effectConcurrency: '즉시 적용됩니다. 값을 올리면 대기 중인 작업이 바로 시작되고, 내리면 다운로드 중인 작업은 중단되지 않습니다',
  effectThreads: '다운로드 중인 작업에는 영향을 주지 않으며, 이후에 다운로드를 시작하거나 일시 정지 후 계속하는 작업은 새 값으로 나눠 받습니다',
  effectNow: '즉시 적용됩니다',
  effectLater: '이후에 추가되는 작업에만 적용됩니다',
  notVip: '빌리빌리 프리미엄 회원이 아닙니다. 4K, 1080P 고비트레이트 등 프리미엄 화질은 받을 수 없으며, 다운로드할 수 있는 가장 높은 화질로 자동으로 낮춥니다',
  appNotLoggedIn: '앱이 로그인되어 있지 않습니다. 링크를 분석하려면 로그인이 필요합니다. {loginHint}',
  loginUnknown: '지금은 로그인 상태를 확인할 수 없습니다(네트워크 문제일 수 있음)',
  waitingAuth: '작업 {count}개가 로그인을 기다리고 있으며, 다시 로그인하면 자동으로 계속됩니다. {loginHint}',
  paused: '작업 {count}개가 일시 정지되었습니다(앱을 다시 시작하면 완료되지 않은 작업은 자동으로 일시 정지됩니다). control_tasks action=resume으로 계속할 수 있습니다',
  failed: '작업 {count}개가 실패했습니다. control_tasks action=retry status=failed로 다시 시도할 수 있습니다',
  lowSpace: '다운로드 폴더가 있는 디스크의 남은 공간이 5 GB 미만입니다',
  pageError: '페이지를 넘기는 중 오류가 발생해({error}) 처음 {count}개만 가져왔습니다. 잠시 후 refresh=true로 다시 시도할 수 있습니다',
  truncated: '처음 {count}개만 가져왔습니다. 더 필요하면 max_items를 늘리세요(최대 {max})',
  moreItems: '아직 반환되지 않은 항목이 있습니다. offset={next}로 이어서 읽으세요',
  lazyItems: 'lazy 항목은 아직 파트가 펼쳐지지 않은 영상이며, 다운로드에 추가할 때 자동으로 펼쳐집니다',
  dupResumed: '같은 요청이 이전에 제출되어, 지난번에 대기열에 추가되지 않은 항목을 이어서 처리했습니다',
  dupSame: '같은 요청이 이전에 제출되어 중복으로 추가하지 않았습니다. get_batch_status batch_id={id}로 진행 상황을 확인하고, 다시 제출하려면 다른 request_id를 사용하세요',
  videosWith: 'videos와 {key}은(는) 함께 사용할 수 없습니다',
  videosEmpty: 'videos는 비어 있을 수 없습니다',
  videosTooMany: 'videos는 한 번에 최대 {max}개입니다. 여러 배치로 나눠 제출하세요',
  titleTooLong: 'title은 {max}자를 넘을 수 없습니다',
  videosNone: 'videos에 다운로드할 수 있는 영상이 없습니다(예: {examples}). 컬렉션, 즐겨찾기 폴더 같은 목록 링크는 url을 사용하세요',
  videosTitle: '영상 {count}개',
  checkProgress: 'get_batch_status batch_id={id} wait_seconds=30으로 진행 상황을 확인하세요',
  rejected: '{count}개 항목은 해당하는 영상을 찾을 수 없어 무시했습니다. rejected를 확인하세요',
  idsAndAll: 'ids와 all은 하나만 사용할 수 있습니다',
  idsNone: 'ids가 모두 이 링크에 없습니다(예: {examples}). 먼저 parse_link로 항목 id를 확인하세요',
  pagedList: '항목이 {total}개인 목록입니다. all=true를 전달해 모두 다운로드하거나 ids로 항목을 선택하세요',
  unknownIds: 'id {count}개가 이 링크에 없어 무시했습니다',
  addPageError: '페이지를 넘기는 중 오류가 발생해({error}) 처음 {count}개만 추가했습니다. 잠시 후 다시 제출하면 나머지를 보충할 수 있습니다',
  addTruncated: '처음 {count}개만 가져왔고 나머지는 추가하지 않았습니다. 더 필요하면 max_items를 늘리세요(최대 {max})',
  allDownloaded: '선택한 항목은 모두 이미 다운로드했습니다. 다시 다운로드하려면 skip_downloaded=false를 전달하세요',
  nothingToDownload: '다운로드할 수 있는 항목이 없습니다',
  controlScope: 'task_ids, batch_id 또는 status로 작업할 대상을 지정해야 합니다',
  notWatermarking: '워터마크를 제거하는 중이 아닙니다',
  wrongStatus: '{status} 상태의 작업은 {action}할 수 없습니다',
  taskIdsAndBatch: 'task_ids와 batch_id는 하나만 사용할 수 있습니다',
  nothingToUpdate: '변경할 설정이 없습니다. 변경 가능한 항목: {names}'
} satisfies Messages['mcpTools']
