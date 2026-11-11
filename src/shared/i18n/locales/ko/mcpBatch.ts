import type { Messages } from '../types'

export default {
  expanding: '영상 파트를 가져와 나눠서 대기열에 추가하는 중입니다({done}/{total}). 이미 추가된 작업은 먼저 다운로드를 시작하며, wait_seconds를 붙여 기다릴 수 있습니다',
  interruptedError: '영상 파트를 가져오는 중 오류가 발생해({error}) 중단되었고, 아직 {count}개 항목이 대기열에 추가되지 않았습니다. 잠시 후 control_tasks action=resume batch_id={id}를 호출해 계속하세요',
  interruptedQuit: '앱이 종료될 때 {count}개 항목이 아직 대기열에 추가되지 않았습니다. control_tasks action=resume batch_id={id}를 호출해 계속하세요',
  waitingAuth: '로그인이 만료되었습니다. 다시 로그인하면 자동으로 계속됩니다. {loginHint}',
  retrying: '다운로드 중이며, 작업 {count}개가 오류 후 자동 재시도를 기다리고 있습니다. wait_seconds를 붙여 기다릴 수 있습니다',
  downloading: '다운로드 중입니다. wait_seconds를 붙여 기다릴 수 있습니다',
  paused: '작업 {count}개가 일시 정지되었습니다(앱을 다시 시작하면 완료되지 않은 작업은 자동으로 일시 정지됩니다). control_tasks action=resume batch_id={id}를 호출해 계속하세요',
  retryFailed: 'control_tasks action=retry batch_id={id}를 호출해 실패한 작업을 다시 시도하세요',
  unsupported: '다운로드할 수 없는(unsupported) 작업은 대부분 빌리빌리 프리미엄이 필요하거나, 지역 제한이 있거나, 유료 콘텐츠이므로 다시 시도해도 소용없습니다',
  allDownloaded: '선택한 항목은 모두 이미 다운로드했습니다'
} satisfies Messages['mcpBatch']
