import type { Messages } from '../types'

export default {
  methodFast: '빠른 제거',
  methodFastHint: '주변 화면으로 채우며 몇 분 안에 끝나지만 워터마크 부분이 조금 흐려집니다',
  methodAi: 'AI 정밀 보정',
  methodAiHint: 'AI 모델로 프레임마다 워터마크 아래의 화면을 복원합니다. 훨씬 선명하지만 느립니다',
  title: '워터마크 제거',
  subtitle: '상자를 끌어 워터마크를 덮고, 네 모서리와 네 변을 끌어 크기를 조정하세요. 처리할 때 영상을 다시 인코딩하며 완료되면 원본 파일을 대체합니다.',
  alreadyApplied: '이 영상은 이미 워터마크를 한 번 제거했습니다. 다시 처리하면 한 번 더 인코딩하므로 화질이 약간 떨어집니다.',
  detected: '{corner}의 워터마크를 감지했습니다. 상자를 더 조정할 수 있습니다.',
  notDetected: '워터마크를 자동으로 감지하지 못했습니다. 상자를 워터마크 위로 끌어 주세요.',
  frameAlt: '영상 화면',
  regionLabel: '워터마크 영역. 방향키로 이동하고 Shift를 누른 채로 누르면 10픽셀씩 이동합니다',
  detecting: '워터마크를 감지하는 중…',
  nextFrame: '다른 프레임',
  showOriginal: '원본 보기',
  preview: '효과 미리보기',
  reset: '초기화',
  cancel: '취소',
  retry: '다시 시도',
  downloadModel: '모델 다운로드',
  estimating: '소요 시간을 추정하는 중(처음에는 모델을 불러오고 몇 프레임을 시험 처리하느라 십여 초 걸립니다)…',
  startAi: 'AI 정밀 보정 시작',
  start: '처리 시작'
} satisfies Messages['wmDialog']
