// main / preload / renderer 共用的数据类型

export interface UserInfo {
  mid: number
  uname: string
  face: string
  vipActive: boolean
  vipLabel: string
}

export type AuthState = { loggedIn: false; expired?: boolean } | { loggedIn: true; user: UserInfo }

export interface BrowserProfile {
  id: string
  browser: string
  profile: string
  hasBiliLogin: boolean
  /** macOS 隐私保护拦截了读取，需要给本应用“完全磁盘访问权限” */
  blocked?: boolean
}

export type MediaKind = 'ugc' | 'pgc'

/** 一个可下载的单元：普通视频的一个分P，或番剧/电影的一集 */
export interface MediaItem {
  key: string
  kind: MediaKind
  title: string
  index: number
  cid: number
  bvid?: string
  aid?: number
  epId?: number
  cover?: string
  duration?: number
  badge?: string
  needVip?: boolean
  unavailable?: string
}

export interface MediaGroup {
  id: string
  title: string
  items: MediaItem[]
}

export interface ParseResult {
  kind: MediaKind
  title: string
  cover: string
  owner?: string
  groups: MediaGroup[]
  defaultSelected: string[]
}

export interface QualityOption {
  qn: number
  label: string
  needVip: boolean
  needLogin: boolean
}

export type CodecPref = 'avc' | 'hevc' | 'av1'

export interface DownloadOptions {
  qn: number
  codec: CodecPref
  audioOnly: boolean
  cover: boolean
  subtitle: boolean
  danmaku: boolean
}

export interface EnqueueRequest {
  title: string
  cover: string
  items: MediaItem[]
  options: DownloadOptions
}

export type TaskStatus =
  | 'queued'
  | 'fetching'
  | 'downloading'
  | 'merging'
  | 'extras'
  | 'done'
  | 'paused'
  | 'waitingAuth'
  | 'error'
  | 'unsupported'

export interface TaskInfo {
  id: string
  title: string
  groupTitle: string
  item: MediaItem
  options: DownloadOptions
  /** 输出文件不含扩展名的相对路径（相对下载目录） */
  relBase: string
  status: TaskStatus
  downloaded: number
  total: number
  speed: number
  qualityLabel?: string
  error?: string
  /** 不影响主文件的提示，例如“没有 CC 字幕” */
  note?: string
  outputPath?: string
  createdAt: number
}

export type PowerMode = 'off' | 'system' | 'display'

export interface Settings {
  downloadDir: string
  concurrency: number
  powerMode: PowerMode
  defaultQn: number
  defaultCodec: CodecPref
  extras: { cover: boolean; subtitle: boolean; danmaku: boolean }
  danmaku: { fontSize: number; opacity: number; duration: number }
  clipboardWatch: boolean
}

/** preload 通过 contextBridge 暴露给渲染进程的接口 */
export interface BiliApi {
  auth: {
    check(): Promise<AuthState>
    openLoginWindow(): Promise<AuthState>
    listBrowsers(): Promise<BrowserProfile[]>
    importFromBrowser(id: string): Promise<AuthState>
    logout(): Promise<AuthState>
    simulateExpiry(): Promise<void>
    onRequired(cb: () => void): () => void
    onChanged(cb: (state: AuthState) => void): () => void
  }
  parse(input: string): Promise<ParseResult>
  qualities(item: MediaItem): Promise<QualityOption[]>
  download: {
    enqueue(req: EnqueueRequest): Promise<void>
    list(): Promise<TaskInfo[]>
    pause(id: string): Promise<void>
    resume(id: string): Promise<void>
    resumeAll(): Promise<void>
    cancel(id: string): Promise<void>
    retry(id: string): Promise<void>
    clearFinished(): Promise<void>
    onUpdate(cb: (tasks: TaskInfo[]) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    chooseDir(): Promise<Settings>
  }
  readClipboard(): Promise<string>
  showInFolder(path: string): Promise<void>
  openFullDiskAccessSettings(): Promise<void>
}
