<div align="center">

<img src="build/icon.png" width="128" alt="Bili Downloader 아이콘">

# Bili Downloader

**좋아하는 bilibili 영상, 내 드라이브에 그대로 저장.** 링크 복사, 붙여넣기, 다운로드 클릭이면 끝. 동영상, 컬렉션, 애니메이션, 강좌를 한 번에 받고, 화질은 최대 8K / Dolby Vision, 자막·탄막·챕터도 같이 저장돼요. 내친김에 AI로 워터마크를 지우거나, 귀찮은 일은 AI 에이전트한테 맡겨도 돼요. Windows, macOS, Linux에서 쓸 수 있는 무료 오픈소스 앱이에요.

[![Latest release](https://img.shields.io/github/v/release/wangzi6224/bili-downloader?sort=semver)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/wangzi6224/bili-downloader/total)](https://github.com/wangzi6224/bili-downloader/releases)
[![Stars](https://img.shields.io/github/stars/wangzi6224/bili-downloader?style=flat)](https://github.com/wangzi6224/bili-downloader/stargazers)
[![License: MIT](https://img.shields.io/github/license/wangzi6224/bili-downloader)](LICENSE)

[![Download for macOS](https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/wangzi6224/bili-downloader/releases/latest)
[![Download for Linux](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/wangzi6224/bili-downloader/releases/latest)

**[웹사이트](https://wangzi6224.github.io/bili-downloader/)** · **[다운로드](https://github.com/wangzi6224/bili-downloader/releases/latest)** · **[시작하기](#네-단계로-시작하기)** · **[AI한테 맡기기(MCP)](#다운로드는-ai한테-맡기기-mcp)** · **[FAQ](#자주-묻는-질문)**

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | **한국어** | [Français](README.fr.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

<sub>v0.13.0부터 앱 UI는 한국어, 영어, 중국어 간체, 일본어, 프랑스어, 이탈리아어, 러시아어, 힌디어를 지원합니다. 기본적으로 시스템 언어를 따르며 설정에서 변경할 수 있습니다.</sub>

</div>

## 일단 구경부터

**AI 워터마크 제거 전후 비교**: 왼쪽은 다운로드한 원본, 오른쪽은 AI 보정 결과예요.

https://github.com/user-attachments/assets/835dda86-4575-4311-808b-507c04bbd589

<sub>출처: bilibili 크리에이터 「陈翔六点半」의 작품 『陈翔六点半：一念贪虚妄，半生困赌局』. 원본 영상: [https://www.bilibili.com/video/BV1vU446BEiU](https://www.bilibili.com/video/BV1vU446BEiU). 저작권은 원작자에게 있으며, 원본 영상을 정식으로 시청해 주시기 바랍니다.<br>본 영상은 소프트웨어 기능 시연 목적으로만 사용되며 개인 학습 용도로 한정됩니다. 재배포를 금지합니다. 권리 침해에 해당하는 경우 [Issues](https://github.com/wangzi6224/bili-downloader/issues)를 통해 연락해 주시면 신속히 삭제하겠습니다.</sub>

<p align="center">
  <img src="docs/screenshots/queue.png" width="49%" alt="다운로드 대기열">
  <img src="docs/screenshots/select.png" width="49%" alt="에피소드, 화질, 추가 콘텐츠 선택">
</p>

## 이런 걸 할 수 있어요

| | |
| --- | --- |
| **화질은 끝까지** <br> 8K, Dolby Vision, HDR: 내 계정으로 볼 수 있으면 받을 수 있어요. AVC / HEVC / AV1 중에 고르고, 오디오는 Dolby Atmos와 Hi-Res FLAC까지. 기본은 재인코딩 없이 원본 스트림 그대로예요. | **링크만 던지면 끝** <br> 단일 동영상, 여러 파트로 된 동영상, 컬렉션, 애니메이션, 영화, 강좌, 즐겨찾기, 나중에 보기, 업로더 페이지, 오디오, 랭킹… 목록도 통째로 한 번에 분석하고, b23.tv 단축 링크나 공유 문구도 그대로 돼요. |
| **AI 워터마크 제거** <br> 모서리 워터마크는 알아서 찾아내고, 직접 박스를 그려도 돼요. 'AI 보정'을 켜면 그 아래 화면을 프레임마다 다시 그려 줘요. | **자막, 탄막, 전부 다** <br> CC 자막은 `.srt`로 따로 저장하거나 영상에 삽입, 탄막은 `.ass` / `.xml`, 여기에 챕터, 커버, Kodi / Jellyfin용 NFO까지. |
| **대기열에 넣고 딴 거 하세요** <br> 이어받기, 멀티스레드 다운로드, 속도 제한, 자동 재시도, 이름 템플릿까지. 업로더, 즐겨찾기, 컬렉션을 구독해 두면 새 업로드는 알아서 받아져요. | **AI한테 시키세요** <br> 내장 로컬 MCP 서버 덕분에 Claude 같은 AI 클라이언트가 검색, 링크 분석, 다운로드 추가, 워터마크 제거, 진행 상황 체크까지 해 줘요. |

> [!NOTE]
> 이 프로젝트는 비공식 도구이며 bilibili와 아무런 관련이 없고 승인을 받지도 않았습니다. 본인 계정으로 시청 권한이 있는 콘텐츠만 개인 용도로 다운로드하고, 창작자의 권리와 bilibili 이용약관을 존중해 주세요.

## 네 단계로 시작하기

1. [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest)에서 시스템에 맞는 설치 파일을 **다운로드**합니다:

   | 시스템 | 파일 |
   | --- | --- |
   | macOS, Apple 실리콘(M1 이후) | `bili-downloader-<version>-arm64.dmg` |
   | macOS, Intel | `bili-downloader-<version>-x64.dmg` |
   | Windows x64 | `bili-downloader-<version>-x64.exe` |
   | Linux x64 | `bili-downloader-<version>-x86_64.AppImage` 또는 `bili-downloader-<version>-amd64.deb` |

2. bilibili 계정에 **로그인**합니다([로그인](#로그인과-개인정보) 참고). 링크를 분석하려면 계정이 필요합니다.
3. **링크를 붙여 넣습니다.** 앱으로 돌아오면 클립보드에서 자동으로 인식하며, 입력창에서 <kbd>⌘</kbd><kbd>V</kbd>(Windows와 Linux에서는 <kbd>Ctrl</kbd><kbd>V</kbd>)를 누른 뒤 **解析**(분석)를 클릭해도 됩니다.
4. **골라서 다운로드합니다.** 항목을 고르고(전체 선택, 선택 반전, <kbd>Shift</kbd> 범위 선택, 제목이나 번호(예: `1-5,7`)로 필터링), 화질, 출력 형식, 추가 콘텐츠를 정한 뒤 **下载**(다운로드)를 클릭합니다.

링크 대신 다음 키워드를 입력할 수도 있습니다: `稍后再看` 또는 `watchlater`(나중에 보기), `每周必看`(주간 추천), `排行榜`(랭킹).

## 설치

### macOS

1. [Releases](https://github.com/wangzi6224/bili-downloader/releases/latest)에서 최신 `.dmg`를 다운로드합니다. Apple 실리콘은 `arm64`, Intel은 `x64`입니다.
2. dmg를 열고 **B站下载器**를 **응용 프로그램** 폴더로 드래그합니다.
3. 앱은 ad-hoc 서명만 되어 있고 공증되지 않았기 때문에 처음 실행할 때 macOS가 차단합니다. 한 번 열기를 시도한 뒤 **시스템 설정 → 개인정보 보호 및 보안**에서 **그래도 열기**를 클릭하세요(macOS 15부터는 우클릭 → 열기가 더 이상 동작하지 않습니다). 또는 터미널에서 다음을 실행합니다:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/B站下载器.app"
   ```

macOS 12 이상이 필요합니다.

### Windows

[Releases](https://github.com/wangzi6224/bili-downloader/releases/latest)에서 `bili-downloader-<version>-x64.exe`를 다운로드해 설치 프로그램을 실행합니다. 현재 사용자 계정에 설치되며 관리자 권한이 필요하지 않습니다. 설치 프로그램은 서명되지 않았기 때문에 Windows에서 알 수 없는 게시자 경고가 표시될 수 있습니다.

### Linux

<details>
<summary>AppImage 또는 deb(64비트 x86 전용)</summary>

- **AppImage**(모든 배포판에서 사용 가능, 자동 업데이트 지원): `bili-downloader-<version>-x86_64.AppImage`. 실행 권한을 준 뒤 실행합니다:

  ```bash
  chmod +x bili-downloader-*-x86_64.AppImage
  ./bili-downloader-*-x86_64.AppImage
  ```

  AppImage를 실행하려면 FUSE 2가 필요합니다. 실행되지 않으면 FUSE 2를 설치하거나(Ubuntu 24.04 이상은 `sudo apt install libfuse2t64`, 그 이전 버전은 `libfuse2`) `--appimage-extract-and-run` 옵션을 붙여 실행하세요.
- **deb**(Debian, Ubuntu 및 파생 배포판): `bili-downloader-<version>-amd64.deb`. `sudo apt install ./bili-downloader-<version>-amd64.deb`로 설치하면 애플리케이션 메뉴에 **B站下载器**가 나타납니다.

창을 닫아 백그라운드에서 실행 중일 때는 트레이 아이콘을 클릭하면 창이 다시 열립니다. GNOME에서는 AppIndicator 확장이 필요합니다(Ubuntu에는 기본으로 포함되어 있습니다). 메뉴 막대는 숨겨져 있으며 <kbd>Alt</kbd> 키를 누르면 표시됩니다.

</details>

### 업데이트

설치 후에는 앱이 스스로 업데이트를 확인합니다. macOS 앱, Windows 설치 프로그램, Linux AppImage는 업데이트를 바로 설치할 수 있고, deb 버전은 업데이트 내용을 보여 준 뒤 다운로드 페이지로 안내합니다.

## AI 워터마크 제거

모서리에 업로더 워터마크가 떡하니 박혀 있나요? 없애는 방법은 두 가지예요:

| 모드 | 동작 방식 | 적합한 경우 |
| --- | --- | --- |
| **빠른 모드**(기본값) | 모서리의 워터마크를 찾아 ffmpeg의 `delogo`로 주변 픽셀을 이용해 메움 | 빠른 결과, 정적인 배경 |
| **AI 보정**(AI 精修) | [LaMa](https://github.com/advimman/lama) 인페인팅 모델로 워터마크 아래 화면을 프레임마다 다시 그림 | 훨씬 깔끔한 결과, 움직임이 많은 장면 |

- 다운로드 옵션에서 켜거나, 다운로드 목록 위의 **下载后去水印**(다운로드 후 워터마크 제거) 스위치로 켭니다. 이 스위치는 언제든 바꿀 수 있습니다.
- 이미 다운로드한 영상은 워터마크 위에 직접 영역을 지정해 수동으로 제거할 수 있습니다.
- AI 보정은 시작 전에 예상 소요 시간을 보여 주며, GPU가 있으면 GPU를 사용합니다. 모델(약 200MB)은 설치 파일에 들어 있지 않으며, AI 보정을 처음 쓸 때 다운로드되고 SHA-256으로 검증됩니다.
- 워터마크를 제거하면 영상을 재인코딩합니다. HDR과 Dolby Vision 영상은 건너뜁니다.

## 다운로드는 AI한테 맡기기 (MCP)

앱의 로컬 [Model Context Protocol](https://modelcontextprotocol.io) 서버를 켜면 Claude 같은 AI 클라이언트가 bilibili 검색, 다운로드 추가, 진행 상황 확인을 대신 해 줘요. 한 번 설정해 두면 원하는 걸 그냥 말하면 돼요:

> bilibili에서 길이가 30~60분인 "Blender 튜토리얼" 영상을 검색해서 조회수가 가장 높은 다섯 개를 골라 하나의 배치로 다운로드해 줘.

에이전트는 `search_videos`로 후보를 찾고, 다섯 영상을 `download_batch`로 하나의 배치로 대기열에 넣은 뒤, `get_batch_status`로 완료될 때까지 진행 상황을 확인합니다.

> 이 컬렉션에서 아직 받지 않은 영상을 전부 다운로드하고, AI 보정으로 워터마크를 제거해 줘: https://space.bilibili.com/…

이 경우 에이전트는 `parse_link`로 컬렉션을 펼치고, `download_batch`로 다운로드하며(이미 받은 항목은 건너뜀), `get_batch_status`로 워터마크가 있는 파일과 제거에 걸릴 시간을 확인한 뒤, `remove_watermark`로 워터마크를 제거합니다.

### 설정

**设置 → AI 助手**(설정 → AI 어시스턴트)에서 **全部安装**(모두 설치)를 누르거나 어시스턴트별로 설치합니다. 한 번의 클릭으로 MCP 서버와 skill이 다음에 추가됩니다:

Claude Code · Claude Desktop (macOS, Windows) · Codex · Cursor · Gemini CLI · WorkBuddy · CodeBuddy · Trae CN · Qoder · Qwen Code

- 설치한 뒤 어시스턴트를 다시 시작하세요. 그다음부터는 어떤 대화에서든 빌리빌리 다운로드나 검색을 요청하면 이 앱을 사용합니다.
- 어시스턴트 설정에는 토큰이 저장되지 않습니다. 어시스턴트가 작은 브리지를 실행하고, 브리지가 앱의 현재 포트와 토큰을 읽습니다. 앱이 실행 중이 아니면 백그라운드에서 엽니다(트레이 아이콘만 표시).
- 앱이 업데이트되거나 위치가 바뀌면 다음 실행 때 설치된 설정과 skill이 자동으로 업데이트됩니다. 어시스턴트에서 직접 지운 것은 다시 설치하지 않습니다.

다른 클라이언트는 여전히 HTTP로 연결할 수 있습니다. 같은 페이지의 **接入 AI 客户端**(AI 클라이언트 연결) 버튼으로 액세스 토큰이 들어 있는 클라이언트 설정(JSON)이나 Claude Code 명령을 복사할 수 있습니다.

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

<details>
<summary>모든 MCP 도구</summary>

| 도구 | 설명 |
| --- | --- |
| `get_status` | 로그인 및 대회원(프리미엄) 상태, 대기열 요약, 다운로드 폴더의 남은 공간, 주의할 점. 가장 먼저 호출 권장 |
| `parse_link` | bilibili 링크(동영상, 컬렉션, 애니메이션, 강좌, 즐겨찾기, 업로더 등) 분석. 목록은 자동으로 페이지를 넘김. 항목 ID가 고정되며, 나눠서 읽거나 분P를 펼칠 수 있음 |
| `download_batch` | 링크 전체 또는 선택한 항목을 하나의 배치로 대기열에 추가하고 `batch_id`를 반환. 이미 받은 항목은 기본적으로 건너뛰며, 같은 요청을 다시 보내도 중복 다운로드하지 않음. `videos`를 쓰면 검색 결과 같은 여러 영상을 하나의 배치로 제출 가능 |
| `get_batch_status` | 배치 진행 상황: 상태별 개수, 속도, 예상 남은 시간, 실제 화질, 실패 원인, 빌리빌리 워터마크가 있는 영상과 제거 방식별 예상 소요 시간. `wait_seconds`로 변화를 기다릴 수 있음 |
| `list_batches` | 최근 제출한 배치 |
| `list_tasks` | 작업을 페이지 단위로 조회(배치, 상태, 제목으로 필터 가능) |
| `control_tasks` | 작업 일괄 일시정지·재개·재시도·다시 받기·제거(다운로드한 파일은 삭제하지 않음), 진행 중인 워터마크 제거 취소 |
| `remove_watermark` | 다운로드한 영상의 워터마크 제거(빠른 제거 또는 AI 보정), 먼저 소요 시간만 예상해 볼 수도 있음. 다시 인코딩해 원본 파일을 교체함 |
| `get_settings` / `update_settings` | 다운로드 폴더, 동시 다운로드 수, 스레드 수, 속도 제한, 자동 재시도, 기본 화질과 다운로드 옵션 조회·변경 |
| `search_videos` | 키워드로 영상을 검색하며 게시일과 길이로 거를 수 있음. 결과에 제목, 업로더, 게시 시각, 길이, 조회수, 분류, 태그, 설명 요약 포함 |
| `search_users` | 이름으로 업로더를 검색해 `mid`, 팔로워 수, 영상 수, `parse_link`에 넘길 수 있는 스페이스 링크를 반환 |
| `get_video_info` | 한 번에 최대 20개 영상의 상세 정보 조회: 통계, 태그, 설명, 파트 수, 컬렉션, 선택 시 관련 영상 포함 |
| `get_video_transcript` | 영상의 주요 내용 확인: Bilibili AI 요약과 개요, 챕터, 자막 전문을 가져오며 자막은 나누어 읽을 수 있음. 모든 영상에 있지는 않고, AI 요약과 AI 자막은 로그인 필요 |
| `get_video_comments` | 댓글과 답글을 커서로 넘겨 가며 조회하고 인기순이나 시간순으로 정렬. 로그인하지 않으면 Bilibili가 몇 개만 반환 |
| `start_login` | 앱이 로그인되어 있지 않을 때 로그인: 사용자 브라우저의 로그인 정보를 가져오거나(Chrome 우선, 읽을 수 있는 브라우저부터 사용) `method=qr`로 로그인 창을 열어 QR 코드를 스캔 |
| `get_login_status` | 로그인 진행 상황 확인, 이 컴퓨터의 브라우저 목록 조회. `wait_seconds`를 주면 로그인에 성공하는 즉시 반환되므로 에이전트가 스캔 완료를 알 수 있음 |

</details>

서버는 `127.0.0.1`에서만 수신하며(포트 변경 가능), Bearer 토큰이 필수이고, DNS 리바인딩을 막기 위해 `Host` / `Origin` 헤더를 검사합니다. 토큰은 언제든 다시 생성할 수 있습니다.

## 전체 기능 목록

<details>
<summary>지원하는 링크</summary>

- 일반 동영상(BV / av), 여러 파트로 된 동영상, 컬렉션, 애니메이션과 영화(ep / ss / md), 유료 강좌
- 즐겨찾기 폴더, 나중에 보기, 업로더의 업로드 동영상·컬렉션·시리즈(키워드 필터 지원)
- 오디오와 재생목록(au / am), 「每周必看」(주간 추천), 카테고리별 랭킹
- b23.tv 등의 단축 링크와 제목이 섞인 공유 문구
- 여러 링크를 한 번에 분석하고, 즐겨찾기나 업로더 목록처럼 페이지가 나뉜 목록은 페이지 단위로 불러오기

</details>

<details>
<summary>화질과 포맷</summary>

- 화질 목록은 API에서 가져오며(8K / Dolby Vision / HDR / 4K / 1080P60 / …), 프리미엄 회원(大会员) 전용 화질을 표시
- 코덱 우선순위 AVC / HEVC / AV1, 오디오는 Dolby Atmos와 Hi-Res 무손실 FLAC까지 지원
- 전체 동영상, 오디오만, 영상만 선택 가능, MP4 또는 MKV
- 기본적으로 ffmpeg로 스트림을 그대로 복사해 합치며 재인코딩하지 않음. 워터마크 제거를 켰을 때만 영상을 재인코딩함

</details>

<details>
<summary>추가 콘텐츠</summary>

- 커버: 이미지로 저장하거나 파일에 삽입
- CC 자막: `.srt`로 저장하거나 동영상에 삽입
- 탄막(댓글): `.ass` 및/또는 `.xml`, 글꼴 크기·불투명도·표시 시간 조절 가능
- bilibili 진행 바의 구간을 실제 챕터로 기록
- Kodi / Jellyfin 미디어 라이브러리용 NFO 메타데이터
- 워터마크 제거: 빠른 모드 또는 AI 보정([AI 워터마크 제거](#ai-워터마크-제거) 참고)

</details>

<details>
<summary>대기열과 네트워크</summary>

- 동시 다운로드 수, 멀티스레드 분할 다운로드, 속도 제한, 네트워크 오류 시 자동 재시도 조절 가능
- 일시정지, 재개, 이어받기(재시작 후에도 가능). 다운로드할 수 없는 작업은 이유를 표시
- 프록시: 직접 연결, 시스템 설정, 수동 설정. 내장 지연 시간 테스트로 가장 빠른 bilibili CDN 노드 선택
- 다운로드 중 잠자기 방지(또는 화면 켜짐 유지), 대기열이 끝나면 알림

</details>

<details>
<summary>정리와 자동화</summary>

- 이름 템플릿: 변수(`{title}`, `{series}`, `{index:03}`, `{pubdate:YYYY-MM-DD}` 등), 선택적 구간, 폴더 계층 지원. 단일 동영상, 컬렉션, 애니메이션별로 따로 설정
- 이미 다운로드한 콘텐츠를 감지하고 물어보기 / 건너뛰기 / 다시 다운로드 중 선택
- 구독: 즐겨찾기, 컬렉션, 업로더 등을 주기적으로 확인해 새 콘텐츠를 자동으로 다운로드
- 분석 기록, 클립보드 감시, 라이트 / 다크 테마, 백그라운드 실행, 설정 가져오기 / 내보내기
- GitHub Releases를 통한 앱 내 업데이트(업데이트 내용 표시, 특정 버전 건너뛰기 지원)

</details>

## 로그인과 개인정보

로그인하면 1080P 이상과 프리미엄 회원 콘텐츠까지, 내 계정으로 볼 수 있는 화질과 영상은 전부 받을 수 있어요. 세 가지 방법 중 편한 걸 고르세요:

- **从浏览器导入**(브라우저에서 가져오기): Chrome, Edge, Brave, Arc(macOS 전용), Vivaldi, Opera, Chromium, Firefox, Safari(macOS 전용)의 로그인 쿠키를 재사용합니다.
  - macOS가 읽기를 차단하면 로그인 창에서 해당 브라우저의 데이터 폴더를 선택하세요. Chromium 계열 브라우저에서 가져올 때는 키체인 접근 권한을 요청할 수도 있습니다.
  - Linux에서는 Chromium 계열 브라우저가 쿠키 암호화 키를 시스템 키링(GNOME Keyring / libsecret)에 보관합니다. 앱은 `secret-tool`(`sudo apt install libsecret-tools`로 설치)로 이 키를 읽으며, 이때 키링 잠금 해제를 요청받을 수 있습니다. Snap·Flatpak으로 설치한 Firefox와 Snap 버전 Chromium도 지원합니다.
  - Windows에서는 Chromium 계열 브라우저가 실행 중에 쿠키 데이터베이스를 잠그므로, 가져오기 전에 브라우저를 완전히 종료하세요(백그라운드 프로세스 포함). Chrome 127 이상에서 기록된 쿠키는 앱 바인딩 암호화를 사용하므로 가져올 수 없습니다. 로그인 쿠키가 여기에 해당하면 대신 앱 안에서 로그인하거나 쿠키 문자열을 붙여 넣으세요.
- **在应用内登录**(앱 안에서 로그인): bilibili 공식 로그인 페이지를 열며 QR 코드, 비밀번호, SMS 로그인을 지원합니다.
- **手动粘贴 Cookie**(쿠키 직접 붙여넣기): 세미콜론으로 구분된 쿠키 문자열 또는 브라우저 확장 프로그램으로 내보낸 JSON.

앱은 실행할 때, 창으로 돌아올 때, 링크를 분석할 때, 그리고 API가 로그인 만료를 알릴 때 로그인 상태를 확인합니다. 로그인이 만료되면 다시 로그인하도록 안내하고 스트림 가져오기를 멈췄다가, 다시 로그인하면 대기열을 재개합니다. 로그아웃은 앱 자체의 쿠키만 지우며 브라우저의 로그인에는 영향을 주지 않습니다.

**내 데이터는 어디로 가나요**

- bilibili 쿠키는 앱 자체의 데이터 폴더에 보관되며 bilibili로만 전송됩니다. MCP를 통해 AI 클라이언트에 반환되는 일은 없습니다.
- 다운로드, 병합, 워터마크 제거는 모두 로컬에서 실행됩니다. 회원 가입도, 원격 측정도, 중간에 거치는 자체 서버도 없습니다.
- 앱이 bilibili 외에 접속하는 곳은 GitHub(업데이트 확인)와 ModelScope 또는 Hugging Face(AI 보정 모델을 한 번 다운로드)뿐입니다.
- MCP 클라이언트는 사용자 요청에 따라 계정을 전환하거나 지정한 계정에서 로그아웃할 수 있습니다. 브라우저를 먼저 닫아야 할 때(Windows에서는 브라우저 실행 중 쿠키 데이터베이스가 잠깁니다)는 앱이 대화상자로 묻고, 사용자 본인만 승인할 수 있습니다.

## 자주 묻는 질문

<details>
<summary>로그인 안 하고도 쓸 수 있나요?</summary>

아니요. 링크를 분석하려면 먼저 로그인해야 하며, 받을 수 있는 화질은 본인 계정으로 시청할 수 있는 화질입니다.

</details>

<details>
<summary>1080P / 4K / 8K는 왜 못 골라요?</summary>

화질 목록은 bilibili가 내 계정 기준으로 직접 제공합니다. 더 높은 화질(1080P+ 고비트레이트, 4K, 8K, HDR, Dolby Vision)은 대개 프리미엄 회원(大会员) 계정이 필요하며, 모든 동영상이 모든 화질로 업로드되는 것도 아닙니다.

</details>

<details>
<summary>macOS에서 앱을 열 수 없대요. 이제 어떡하죠?</summary>

앱이 Apple의 공증을 받지 않았기 때문입니다. 한 번 열기를 시도한 뒤 **시스템 설정 → 개인정보 보호 및 보안**에서 **그래도 열기**를 클릭하거나, [설치](#macos)의 `xattr` 명령을 실행하세요.

</details>

<details>
<summary>Windows에서 "Windows의 PC 보호"가 떠요. 어떻게 해요?</summary>

설치 프로그램에 코드 서명이 되어 있지 않기 때문입니다. **추가 정보 → 실행**을 클릭하세요.

</details>

<details>
<summary>작업에 无法下载(다운로드 불가)라고 뜨는 건 왜예요?</summary>

DRM으로 보호된 콘텐츠, 지역 제한 콘텐츠, 계정에 시청 권한이 없는 콘텐츠는 다운로드할 수 없습니다. 작업에 그 이유가 표시됩니다.

</details>

<details>
<summary>워터마크 제거는 왜 이렇게 느려요?</summary>

AI 보정은 모든 프레임을 다시 그리기 때문에, 특히 GPU가 없으면 빠른 모드보다 훨씬 느립니다. 앱은 시작 전에 예상 소요 시간을 보여 주니, 화질보다 속도가 중요하다면 빠른 모드를 쓰세요.

</details>

<details>
<summary>앱을 한국어로 쓸 수 있나요?</summary>

네. v0.13.0부터 한국어를 포함한 8개 언어를 지원합니다. 기본적으로 시스템 언어를 따르며 설정에서 변경할 수 있습니다.

</details>

## 제한 사항

- DRM으로 보호된 콘텐츠, 지역 제한 콘텐츠, 계정에 시청 권한이 없는 콘텐츠는 다운로드할 수 없습니다. 이런 작업은 **无法下载**(다운로드 불가)로 표시되고 이유가 함께 나옵니다.
- Windows x64, macOS x64 / arm64, Linux x64를 지원합니다. Windows와 Linux용 ARM 버전은 제공하지 않습니다.

## 소스에서 빌드

Windows, macOS 또는 Linux, Node.js 22.12 이상, npm이 필요합니다.

```bash
git clone https://github.com/wangzi6224/bili-downloader.git
cd bili-downloader
npm install
npm run dev          # 개발 모드
npm test             # 단위 테스트
npm run typecheck    # 타입 검사
npm run build:mac    # macOS에서 실행: dist/에 x64, arm64용 dmg / zip 생성
npm run build:linux  # Linux에서 실행: dist/에 x64용 AppImage / deb 생성
npm run build:win    # Windows에서 실행: dist/에 x64용 NSIS 설치 프로그램 생성
```

개발 과정은 [CONTRIBUTING.md](CONTRIBUTING.md), 패키징과 릴리스는 [docs/RELEASING.md](docs/RELEASING.md)(중국어)를 참고하세요.

## 프로젝트 구조

```
src/main/auth               로그인: 쿠키 저장, 앱 내 로그인 창, 브라우저에서 가져오기, 만료 감지
src/main/bili               bilibili API: WBI 서명, 동영상 / 애니메이션 / 강좌 / 목록 분석, 스트림, 자막, 탄막
src/main/download           다운로드 대기열, 이어받기, ffmpeg 병합, 추가 콘텐츠(커버, 자막, NFO…)
src/main/watermark          워터마크 감지와 제거(ffmpeg delogo), ai/는 AI 보정(onnxruntime 위의 LaMa 모델)
src/main/net                프록시와 CDN 선택
src/main/update             앱 내 업데이트: update.json 확인, 다운로드 검증, .app / AppImage / NSIS 업데이트 설치
src/main/mcp                로컬 MCP 서버
src/main/agents             MCP 서버와 skill을 AI 어시스턴트에 원클릭 설치
src/bridge                  AI 어시스턴트가 실행하는 stdio 브리지(MCP 서버로 중계)
src/main/subscriptions.ts   구독
src/shared                  모든 프로세스가 공유하는 타입, 링크 분석, 이름 템플릿
src/renderer                UI(React + Tailwind CSS + zustand)
scripts                     ffmpeg 다운로드, 아이콘 생성, 릴리스 게시
website                     제품 웹사이트(Next.js, GitHub Pages에 배포)
```

## 기여하기

이슈와 풀 리퀘스트를 환영합니다. 먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요. 마음에 들었다면 ⭐ 하나 눌러 주세요. 더 많은 사람이 이 프로젝트를 찾을 수 있어요.

## 감사의 말

- bilibili API 문서를 정리한 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
- [FFmpeg](https://ffmpeg.org)와 [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [Electron](https://www.electronjs.org), [electron-vite](https://electron-vite.org), [electron-builder](https://www.electron.build)
- [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [zustand](https://github.com/pmndrs/zustand), [Lucide](https://lucide.dev)

## 라이선스

[MIT](LICENSE) © wangzi6224

앱에는 [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)(`b6.1.1`)의 정적 빌드 FFmpeg가 포함되어 있습니다. FFmpeg는 자체 라이선스를 따르는 별도의 프로그램으로 실행되며, 위의 MIT 라이선스 적용 대상이 아닙니다. 라이선스 전문은 앱 안의 `Contents/Resources/ffmpeg/LICENSE`(macOS) / `resources/ffmpeg/LICENSE`(Windows 및 Linux)에 들어 있으며, [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html)도 참고하세요.

AI 보정은 [onnxruntime](https://github.com/microsoft/onnxruntime)(MIT 라이선스, 앱에 포함)으로 [LaMa](https://github.com/advimman/lama) 인페인팅 모델(Apache-2.0 라이선스, [Carve/LaMa-ONNX](https://huggingface.co/Carve/LaMa-ONNX)의 ONNX 버전)을 실행합니다. 모델은 설치 파일에 들어 있지 않으며 AI 보정을 처음 쓸 때 다운로드됩니다.
