import type { Messages } from '../types'

export default {
  macFileManager: 'Finder',
  macReopenFrom: 'Dock 또는 메뉴 막대 아이콘',
  macAv1Hint: '용량이 가장 작으며 M1 이후의 Mac이 필요합니다',
  macChromiumAuthHint: 'Chrome 계열 브라우저에서 가져올 때 macOS가 키체인 접근 허용을 요청합니다. ‘허용’을 클릭하세요.',
  linuxFileManager: '파일 관리자',
  linuxChromiumAuthHint: 'Chrome 계열 브라우저의 로그인 정보는 시스템 키링에 저장되어 있습니다. 가져올 때 키링 잠금 해제 창이 뜨면 로그인 암호를 입력하세요.',
  winFileManager: '파일 탐색기',
  winChromiumAuthHint: '현재 Windows 사용자 권한으로 브라우저 키를 해독하므로 승인 창이 뜨지 않습니다.',
  trayIcon: '트레이 아이콘',
  av1Hint: '용량이 가장 작으며 오래된 컴퓨터에서는 재생이 끊길 수 있습니다'
} satisfies Messages['platform']
