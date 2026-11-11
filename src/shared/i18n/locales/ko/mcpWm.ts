import type { Messages } from '../types'

export default {
  secOne: '약 {count}초',
  secRange: '약 {lo}~{hi}초',
  minOne: '약 {count}분',
  minRange: '약 {lo}~{hi}분',
  hourOne: '약 {count}시간',
  hourRange: '약 {lo}~{hi}시간',
  ratioOne: '약 {count}배',
  ratioRange: '약 {lo}~{hi}배',

  basisMeasured: '이 컴퓨터에서 실제로 처리한 속도 기준',
  basisCalibrated: '시험 처리 속도 기준',
  basisDefault: '아직 이 컴퓨터에서 처리한 적이 없어 대략적인 추정',

  modelNote: '처음 사용할 때 약 {size} MB의 AI 모델을 먼저 다운로드해야 합니다',
  fastChoice: '빠른 제거 {time}(주변 화면으로 채우며 워터마크 부분이 약간 흐려짐)',
  fastChoiceNoTime: '빠른 제거(주변 화면으로 채우며 워터마크 부분이 약간 흐려짐)',
  aiChoice: 'AI 정밀 보정 {time}(프레임마다 워터마크 아래의 화면을 복원하며 훨씬 선명함{model})',
  aiChoiceNoTime: 'AI 정밀 보정(프레임마다 워터마크 아래의 화면을 복원하며 훨씬 선명함{model})',
  aiChoiceModel: '; {note}',
  choices: '{fast}, {ai}',

  processing: '워터마크를 제거하는 중입니다. wait_seconds를 붙여 기다릴 수 있으며, 처리가 끝나면 작업의 watermark.removed가 true가 됩니다',
  pending:
    '다운로드한 영상 {count}개에 빌리빌리 워터마크가 있습니다. 먼저 사용자에게 제거할지 물어보세요. 선택지: {choices}. ' +
    '워터마크 제거는 다시 인코딩하여 원본 파일을 대체합니다. 사용자가 동의하면 remove_watermark batch_id={id} method=fast 또는 method=ai를 호출하세요',
  willDetect: '다운로드할 때 각 영상에 빌리빌리 워터마크가 있는지 감지하며, 결과는 여기에 표시됩니다',
  plannedOff: '다운로드할 때 빌리빌리 워터마크가 있는지 감지하며 get_batch_status로 확인할 수 있습니다. 워터마크가 있으면 remove_watermark로 제거할지 사용자에게 물어볼 수 있습니다',
  plannedOn: '빌리빌리 워터마크가 감지된 영상은 다운로드 후 워터마크를 제거하며, 다시 인코딩해야 합니다',
  plannedKnown: '길이를 알고 있는 영상의 워터마크 제거에 합계 {time}({basis})',
  plannedAll: '모든 영상의 워터마크 제거에 합계 {time}({basis})',
  plannedModel: '{model}. 다운로드하지 못하면 빠른 제거를 사용합니다',
  speed: '{ratio}({basis})',
  speedBackend: '{ratio}({basis}, {backend})',

  regionInvalid: 'region은 {x, y, w, h} 형식이어야 하며 단위는 영상의 픽셀입니다',
  regionOneTask: 'region은 작업 하나와 함께만 사용할 수 있습니다. 영상마다 워터마크의 위치와 크기가 다를 수 있습니다',
  tooManyTasks: '한 번에 최대 {max}개 작업까지 처리할 수 있습니다',
  busy: '처리 중입니다. 끝날 때까지 기다리세요',
  tooManyInspect: '이번에 감지할 영상이 너무 많습니다(한 번에 최대 {max}개). 나머지는 다시 호출하세요',
  alreadyRemoved: '이미 워터마크를 제거했습니다. 다른 방식으로 다시 처리하려면(예: 빠른 제거 후 AI 정밀 보정으로 변경) force=true를 전달하세요',
  regionOutside: 'region이 화면 밖에 있거나 너무 작습니다(영상 크기 {size})',
  unsure: '빌리빌리 워터마크가 있는지 확실하지 않습니다. 있다고 확인되면 region으로 위치를 지정하세요(suggested_region을 사용할 수 있습니다)',
  noRegion: '워터마크의 위치를 인식하지 못했습니다. 워터마크가 있다고 확인되면 region으로 위치를 지정하세요(픽셀 좌표)',
  total: '합계 {time}({basis})',
  aiFallback: '{model}. 다운로드하지 못하거나 정밀 보정에 실패하면 이번에는 빠른 제거를 사용하며, 작업의 note에 설명이 표시됩니다',
  dryRun: '이것은 추정치이며 처리를 시작하지 않았습니다. 사용자가 동의하면 dry_run을 빼고 다시 호출하세요',
  started: '처리하는 동안 원본 영상은 그대로이며 완료되면 대체됩니다. get_batch_status 또는 list_tasks로 watermark.processing을 확인하고, control_tasks action=cancel_watermark로 취소할 수 있습니다',
  noneSkipped: '처리할 수 있는 영상이 없습니다. 이유는 skipped를 확인하세요',
  noneEligible: '처리할 영상이 없습니다. batch_id를 사용하면 다운로드가 완료되고 워터마크가 감지되었으며 아직 제거되지 않은 영상만 처리합니다. 그 밖의 영상은 task_ids로 지정하세요',
  targetsMissing: 'task_ids 또는 batch_id로 처리할 영상을 지정해야 합니다'
} satisfies Messages['mcpWm']
