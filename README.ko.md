<div align="center">

<img src="build/icon.png" width="128" alt="Bili Downloader 아이콘">

# Bili Downloader

bilibili 링크를 붙여 넣기만 하면 동영상, 여러 파트로 된 동영상, 컬렉션, 애니메이션, 영화를 다운로드할 수 있는 macOS 데스크톱 앱입니다.

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
![macOS 12+](https://img.shields.io/badge/macOS-12%2B-black?logo=apple)
![Apple Silicon | Intel](https://img.shields.io/badge/arch-Apple%20Silicon%20%7C%20Intel-blue)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | **한국어** | [Français](README.fr.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="다운로드 대기열">
  <img src="docs/screenshots/select.png" width="49%" alt="에피소드, 화질, 추가 콘텐츠 선택">
</p>

> [!NOTE]
> 이 프로젝트는 비공식 도구이며 bilibili와 아무런 관련이 없고 승인을 받지도 않았습니다. 본인 계정으로 시청 권한이 있는 콘텐츠만 개인 용도로 다운로드하고, 창작자의 권리와 bilibili 이용약관을 존중해 주세요.

## 기능

### 지원하는 링크

- 일반 동영상(BV / av), 여러 파트로 된 동영상, 컬렉션, 애니메이션과 영화(ep / ss / md), 유료 강좌
- 즐겨찾기 폴더, 나중에 보기, 업로더(UP 主)의 업로드 동영상·컬렉션·시리즈(키워드 필터 지원)
- 오디오와 재생목록(au / am), 「每周必看」(주간 추천), 카테고리별 랭킹
- b23.tv 등의 단축 링크와 제목이 섞인 공유 문구
- 여러 링크를 한 번에 분석하고, 즐겨찾기나 업로더 목록처럼 페이지가 나뉜 목록은 페이지 단위로 불러오기

### 화질과 포맷

- 화질 목록은 API에서 가져오며(8K / Dolby Vision / HDR / 4K / 1080P60 …), 프리미엄 회원(大会员) 전용 화질을 표시
- 코덱 우선순위 AVC / HEVC / AV1, 오디오는 Dolby Atmos와 Hi-Res 무손실 FLAC까지 지원
- 전체 동영상, 오디오만, 영상만 선택 가능, MP4 또는 MKV
- ffmpeg로 스트림을 그대로 복사해 합치며 재인코딩하지 않음

### 추가 콘텐츠

- 커버: 이미지로 저장하거나 파일에 삽입
- CC 자막: `.srt`로 저장하거나 동영상에 삽입
- 탄막(댓글): `.ass` 및/또는 `.xml`, 글꼴 크기·불투명도·표시 시간 조절 가능
- bilibili 진행 바의 구간을 실제 챕터로 기록
- Kodi / Jellyfin 미디어 라이브러리용 NFO 메타데이터

### 대기열과 네트워크

- 동시 다운로드 수, 파일별 분할 멀티스레드, 속도 제한, 네트워크 오류 시 자동 재시도 조절 가능
- 일시정지, 재개, 이어받기(재시작 후에도 가능). 다운로드할 수 없는 작업은 이유를 표시
- 프록시: 직접 연결, 시스템 설정, 수동 설정. 내장 속도 테스트로 가장 빠른 bilibili CDN 노드 선택
- 다운로드 중 잠자기 방지(또는 화면 켜짐 유지), 대기열이 끝나면 알림

### 정리와 자동화

- 이름 템플릿: 변수(`{title}`, `{series}`, `{index:03}`, `{pubdate:YYYY-MM-DD}` 등), 선택적 구간, 폴더 계층 지원. 단일 동영상, 컬렉션, 애니메이션별로 따로 설정
- 이미 다운로드한 콘텐츠를 감지하고 물어보기 / 건너뛰기 / 다시 다운로드 중 선택
- 구독: 즐겨찾기, 컬렉션, 업로더 등을 주기적으로 확인해 새 콘텐츠를 자동으로 다운로드
- 분석 기록, 클립보드 감시, 라이트 / 다크 테마, 백그라운드 실행, 설정 가져오기 / 내보내기
- GitHub Releases를 통한 앱 내 업데이트(업데이트 내용 표시, 특정 버전 건너뛰기 지원)

### AI 연동

- 로컬 [MCP](https://modelcontextprotocol.io) 서버를 통해 Claude 같은 AI 클라이언트가 링크 분석, 다운로드 추가, 진행 상황 확인 가능(아래 **MCP 서버** 참고)

## 설치

1. [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest)에서 최신 `.dmg`를 다운로드합니다:
   - Apple 실리콘(M1 이후): `bili-downloader-<version>-arm64.dmg`
   - Intel: `bili-downloader-<version>-x64.dmg`
2. dmg를 열고 **B站下载器**를 **응용 프로그램** 폴더로 드래그합니다.
3. 앱은 ad-hoc 서명만 되어 있고 공증되지 않았기 때문에 처음 실행할 때 macOS가 차단합니다. 한 번 열기를 시도한 뒤 **시스템 설정 → 개인정보 보호 및 보안**에서 **그래도 열기**를 클릭하세요(macOS 15부터는 우클릭 → 열기가 더 이상 동작하지 않습니다). 또는 터미널에서 다음을 실행합니다:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

macOS 12 이상이 필요합니다. 현재 UI는 중국어 간체만 지원하며, 아래에서는 화면의 표기를 중국어 원문으로 적고 괄호 안에 한국어 번역을 덧붙였습니다.

설치 후에는 앱이 스스로 업데이트를 확인하고 바로 설치할 수 있습니다.

## 빠른 시작

1. bilibili 계정에 로그인합니다(아래 **로그인** 참고). 링크를 분석하려면 로그인이 필요합니다.
2. bilibili 링크를 복사합니다. 앱으로 돌아오면 클립보드에서 자동으로 인식하며, 입력창에서 <kbd>⌘</kbd><kbd>V</kbd>를 누른 뒤 **解析**(분석)를 클릭해도 됩니다.
3. 다운로드할 항목을 고릅니다. 전체 선택, 선택 반전, <kbd>Shift</kbd> 범위 선택, 제목이나 번호(예: `1-5,7`)로 필터링할 수 있습니다.
4. 화질, 출력 형식, 추가 콘텐츠를 고르고 **下载**(다운로드)를 클릭합니다.

링크 대신 다음 키워드를 입력할 수도 있습니다: `稍后再看` 또는 `watchlater`(나중에 보기), `每周必看`(주간 추천), `排行榜`(랭킹).

## 로그인

로그인하면 본인 계정으로 시청할 수 있는 화질과 콘텐츠(1080P 이상, 프리미엄 회원 콘텐츠)를 받을 수 있습니다. 방법은 세 가지입니다:

- **从浏览器导入**(브라우저에서 가져오기): Chrome, Edge, Brave, Arc, Vivaldi, Chromium, Firefox의 로그인 쿠키를 재사용합니다. Chrome, Edge, Brave의 데이터는 macOS 개인정보 보호 대상이므로 먼저 **시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한**에서 이 앱을 허용하고 앱을 다시 시작하세요. Chromium 계열 브라우저에서 가져올 때는 키체인 접근 허용도 요청됩니다.
- **在应用内登录**(앱 안에서 로그인): bilibili 공식 로그인 페이지를 열며 QR 코드, 비밀번호, SMS 로그인을 지원합니다.
- **手动粘贴 Cookie**(쿠키 직접 붙여넣기): 세미콜론으로 구분된 쿠키 문자열 또는 브라우저 확장 프로그램으로 내보낸 JSON.

앱은 실행할 때, 창으로 돌아올 때, 링크를 분석할 때, 그리고 API가 로그인 만료를 알릴 때 로그인 상태를 확인합니다. 로그인이 만료되면 로그인 대화상자를 띄우고 스트림 가져오기를 멈췄다가, 다시 로그인하면 대기열을 자동으로 재개합니다. 로그아웃은 앱 자체의 쿠키만 지우며 브라우저의 로그인에는 영향을 주지 않습니다.

## MCP 서버

앱은 로컬 [Model Context Protocol](https://modelcontextprotocol.io) 서버를 실행해 AI 클라이언트가 다운로드 대기열을 다룰 수 있게 합니다.

1. **设置 → 网络与高级 → MCP 服务**(설정 → 네트워크 및 고급 → MCP 서버)에서 켭니다.
2. 같은 영역의 버튼으로 클라이언트 설정(JSON) 또는 Claude Code 명령을 복사합니다. 액세스 토큰이 이미 포함되어 있습니다.

```json
{
  "mcpServers": {
    "bili-downloader": {
      "type": "http",
      "url": "http://127.0.0.1:39231/mcp",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}
```

```bash
claude mcp add --transport http bili-downloader http://127.0.0.1:39231/mcp --header "Authorization: Bearer <your-token>"
```

| 도구 | 설명 |
| --- | --- |
| `get_status` | 로그인 및 대회원(프리미엄) 상태, 대기열 요약, 다운로드 폴더의 남은 공간, 주의할 점. 가장 먼저 호출 권장 |
| `parse_link` | bilibili 링크(동영상, 컬렉션, 애니메이션, 강좌, 즐겨찾기, 업로더 등) 분석. 목록은 자동으로 페이지를 넘김. 항목 ID가 고정되며, 나눠서 읽거나 분P를 펼칠 수 있음 |
| `download_batch` | 링크 전체 또는 선택한 항목을 하나의 배치로 대기열에 추가하고 `batch_id`를 반환. 이미 받은 항목은 기본적으로 건너뛰며, 같은 요청을 다시 보내도 중복 다운로드하지 않음 |
| `get_batch_status` | 배치 진행 상황: 상태별 개수, 속도, 예상 남은 시간, 실제 화질, 실패 원인. `wait_seconds`로 변화를 기다릴 수 있음 |
| `list_batches` | 최근 제출한 배치 |
| `list_tasks` | 작업을 페이지 단위로 조회(배치, 상태, 제목으로 필터 가능) |
| `control_tasks` | 작업 일괄 일시정지·재개·재시도·다시 받기·제거(다운로드한 파일은 삭제하지 않음) |
| `get_settings` / `update_settings` | 다운로드 폴더, 동시 다운로드 수, 스레드 수, 속도 제한, 자동 재시도, 기본 화질과 다운로드 옵션 조회·변경 |

서버는 `127.0.0.1`에서만 수신하며(포트 변경 가능), Bearer 토큰이 필수이고, DNS 리바인딩을 막기 위해 `Host` / `Origin` 헤더를 검사합니다. 토큰은 언제든 다시 생성할 수 있습니다.

## 제한 사항

- DRM으로 보호된 콘텐츠, 지역 제한 콘텐츠, 계정에 시청 권한이 없는 콘텐츠는 다운로드할 수 없습니다. 이런 작업은 **无法下载**(다운로드 불가)로 표시되고 이유가 함께 나옵니다.
- macOS 전용입니다.

## 소스에서 빌드

macOS, Node.js 22.12 이상, npm이 필요합니다.

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run dev          # 개발 모드
npm test             # 단위 테스트
npm run typecheck    # 타입 검사
npm run build:mac    # dist/에 x64, arm64용 dmg / zip 생성
```

개발 과정은 [CONTRIBUTING.md](CONTRIBUTING.md)(영어), 패키징과 릴리스는 [docs/RELEASING.md](docs/RELEASING.md)(중국어)를 참고하세요.

## 프로젝트 구조

```
src/main/auth               로그인: 쿠키 저장, 앱 내 로그인 창, 브라우저에서 가져오기, 만료 감지
src/main/bili               bilibili API: WBI 서명, 동영상 / 애니메이션 / 강좌 / 목록 분석, 스트림, 자막, 탄막
src/main/download           다운로드 대기열, 이어받기, ffmpeg 병합, 추가 콘텐츠(커버, 자막, NFO…)
src/main/net                프록시와 CDN 선택
src/main/update             앱 내 업데이트: update.json 확인, 다운로드 검증, .app 교체
src/main/mcp                로컬 MCP 서버
src/main/subscriptions.ts   구독
src/shared                  모든 프로세스가 공유하는 타입, 링크 분석, 이름 템플릿
src/renderer                UI(React + Tailwind CSS + zustand)
scripts                     ffmpeg 다운로드, 아이콘 생성, 릴리스 게시
```

## 기여하기

이슈와 풀 리퀘스트를 환영합니다. 먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요.

## 감사의 말

- bilibili API 문서를 정리한 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
- [FFmpeg](https://ffmpeg.org)와 [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [electron-builder](https://www.electron.build)
- [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [zustand](https://github.com/pmndrs/zustand), [Lucide](https://lucide.dev)

## 라이선스

[MIT](LICENSE) © wangzi6224

앱에는 [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)(`b6.1.1`)의 정적 빌드 FFmpeg가 포함되어 있습니다. FFmpeg는 자체 라이선스를 따르는 별도의 프로그램으로 실행되며, 위의 MIT 라이선스 적용 대상이 아닙니다. 라이선스 전문은 앱 안의 `Contents/Resources/ffmpeg/LICENSE`에 들어 있으며, [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html)도 참고하세요.
