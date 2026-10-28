// main / preload / renderer 共用的数据类型
import type { NamingTemplates, NamingValues } from './naming'

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

/** ugc 普通视频，pgc 番剧影视，cheese 课程，audio 音频区 */
export type MediaKind = 'ugc' | 'pgc' | 'cheese' | 'audio'

/** 一个可下载的单元：普通视频的一个分P，或番剧/电影的一集 */
export interface MediaItem {
  key: string
  kind: MediaKind
  title: string
  index: number
  /** 普通视频的分P号（合集里 index 是整个合集的序号） */
  page?: number
  cid: number
  bvid?: string
  aid?: number
  epId?: number
  cover?: string
  duration?: number
  /** 发布时间（unix 秒） */
  pubdate?: number
  desc?: string
  badge?: string
  needVip?: boolean
  unavailable?: string
  /** 来自收藏夹、UP 主投稿等列表时的作者（每项可能不同） */
  owner?: string
  ownerMid?: number
  /**
   * 列表里只拿到了视频级信息（cid 未知或有多个分P），
   * 加入下载队列时再查询详情并展开成分P
   */
  lazy?: boolean
  pages?: number
}

export interface MediaGroup {
  id: string
  title: string
  items: MediaItem[]
  /** 批量解析时，每个来源一组，下载时按组分别命名 */
  source?: { title: string; kind: MediaKind; cover: string; meta?: MediaMeta }
}

/** 需要翻页的来源 */
export type PagedSource =
  | { type: 'fav'; mediaId: number }
  | { type: 'space'; mid: number; keyword?: string }
  | { type: 'spaceSeason'; mid: number; seasonId: number }
  | { type: 'spaceSeries'; mid: number; seriesId: number }

export interface Paging {
  source: PagedSource
  /** 已加载到第几页 */
  page: number
  total: number
  hasMore: boolean
}

export interface PageResult {
  items: MediaItem[]
  page: number
  total: number
  hasMore: boolean
}

/** 整个视频 / 合集 / 剧集的元数据，用于命名和 NFO */
export interface MediaMeta {
  desc?: string
  owner?: string
  ownerMid?: number
  pubdate?: number
  /** 分区或番剧风格 */
  genres?: string[]
  url?: string
}

export interface ParseResult {
  kind: MediaKind
  title: string
  cover: string
  owner?: string
  meta?: MediaMeta
  groups: MediaGroup[]
  defaultSelected: string[]
  paging?: Paging
  /** 用户输入的原始链接（订阅时用） */
  input?: string
  /** 多个链接一起解析的结果 */
  batch?: boolean
  /** 批量解析里失败的链接 */
  failures?: { input: string; error: string }[]
}

export type CodecPref = 'avc' | 'hevc' | 'av1'

export interface QualityOption {
  qn: number
  label: string
  needVip: boolean
  needLogin: boolean
  /** 这个清晰度实际提供的编码；空数组表示当前账号拿不到 */
  codecs: CodecPref[]
}

/** best：完整视频优先杜比，其次最高码率 AAC；仅音频优先无损 */
export type AudioPref = 'best' | 'flac' | 'dolby' | '192k' | '132k' | '64k'

export interface AudioOption {
  id: AudioPref
  label: string
  available: boolean
}

export interface StreamInfo {
  qualities: QualityOption[]
  audios: AudioOption[]
  /** 没有独立音轨（例如静音视频） */
  hasAudio: boolean
}

/** 下载结果：完整视频 / 仅音频 / 仅视频（无声） */
export type OutputKind = 'full' | 'audio' | 'video'
export type Container = 'mp4' | 'mkv'
export type DanmakuFormat = 'ass' | 'xml' | 'both'

export interface DownloadOptions {
  qn: number
  /** 编码优先级，从前往后尝试 */
  codecOrder: CodecPref[]
  audio: AudioPref
  output: OutputKind
  container: Container
  /** 封面另存为图片 */
  cover: boolean
  /** 封面写进视频 / 音频文件 */
  embedCover: boolean
  /** 字幕另存为 .srt */
  subtitle: boolean
  /** 字幕写进视频文件 */
  embedSubtitle: boolean
  danmaku: boolean
  danmakuFormat: DanmakuFormat
  /** 把 B站进度条上的分段写成章节 */
  chapters: boolean
  /** Kodi / Jellyfin 元数据 */
  nfo: boolean
}

export interface EnqueueRequest {
  title: string
  cover: string
  kind: MediaKind
  meta?: MediaMeta
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
  /** 输出文件不含扩展名的相对路径（相对下载目录）；合并时会按实际画质重新计算 */
  relBase: string
  /** 创建任务时选定的命名模板和变量 */
  template?: string
  nameValues?: NamingValues
  meta?: MediaMeta
  /** 是否属于一次下载多集的番剧（决定 tvshow.nfo） */
  series?: boolean
  /** 整部剧集 / 合集的封面，用作媒体库海报 */
  seriesCover?: string
  status: TaskStatus
  downloaded: number
  total: number
  speed: number
  qualityLabel?: string
  error?: string
  /** 不影响主文件的提示，例如“没有 CC 字幕” */
  note?: string
  outputPath?: string
  /** 正在合并写入的 .tmp，被打断时要删掉 */
  tmpOutput?: string
  /** 创建任务时的下载目录，之后改设置不影响已在队列中的任务 */
  dir?: string
  /** 已自动重试的次数 */
  retries?: number
  /** 下次自动重试的时间戳 */
  retryAt?: number
  createdAt: number
}

export type PowerMode = 'off' | 'system' | 'display'

export type ThemeMode = 'system' | 'light' | 'dark'

/** 选中的内容里有已经下载过的 */
export type DuplicateAction = 'ask' | 'skip' | 'download'

/** 点窗口关闭按钮时：每次询问、隐藏到后台、完全退出 */
export type CloseAction = 'ask' | 'background' | 'quit'

export type ProxyMode = 'direct' | 'system' | 'manual'

export interface McpSettings {
  enabled: boolean
  port: number
  /** 客户端需要带上的访问令牌 */
  token: string
}

/** 订阅：定期检查收藏夹、合集、UP 主等来源，有新内容就自动下载 */
export interface Subscription {
  id: string
  input: string
  title: string
  kind: MediaKind
  intervalMin: number
  enabled: boolean
  options: DownloadOptions
  /** 已经见过的条目 key，只有之后新增的才会下载 */
  seen: string[]
  createdAt: number
  lastCheck?: number
  lastNew?: number
  lastError?: string
}

export interface NewSubscription {
  input: string
  title: string
  kind: MediaKind
  options: DownloadOptions
  intervalMin: number
  /** 现在已有的内容也下载 */
  includeExisting: boolean
  currentKeys: string[]
}

export interface Settings {
  downloadDir: string
  concurrency: number
  powerMode: PowerMode
  defaultQn: number
  /** 新建下载时的默认选项；每次下载后会记住这次的选择 */
  defaults: Omit<DownloadOptions, 'qn'>
  rememberLast: boolean
  naming: NamingTemplates
  duplicateAction: DuplicateAction
  danmaku: { fontSize: number; opacity: number; duration: number }
  clipboardWatch: boolean
  /** 每个文件分几段并行下载 */
  threads: number
  /** 全局限速 KB/s，0 为不限 */
  speedLimit: number
  /** 网络错误自动重试次数，0 为关闭 */
  autoRetry: number
  /** 队列全部结束后发系统通知 */
  notify: boolean
  closeAction: CloseAction
  theme: ThemeMode
  proxy: { mode: ProxyMode; url: string }
  /** 首选的 CDN 节点，空为使用接口返回的地址 */
  cdn: string
  mcp: McpSettings
  /** 启动时（以及之后每天）检查新版本 */
  autoCheckUpdate: boolean
}

/** 某个版本的更新说明（Markdown） */
export interface ReleaseNote {
  version: string
  date: string
  body: string
}

export interface UpdateInfo {
  version: string
  date: string
  /** 比当前版本新的各版本说明，新的在前 */
  notes: ReleaseNote[]
  /** 发布页面，不能自动安装时去这里手动下载 */
  page: string
  /** 当前架构安装包的大小（字节） */
  size: number
  /** 不能自动安装的原因（开发模式、在磁盘映像里运行等） */
  blocker?: string
  /** 用户选择过跳过这个版本 */
  skipped: boolean
}

export type UpdateState = { current: string; checkedAt?: number } & (
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'downloading'; info: UpdateInfo; done: number; total: number }
  | { status: 'ready'; info: UpdateInfo }
  | { status: 'installing'; info: UpdateInfo }
  | { status: 'error'; error: string; info?: UpdateInfo }
)

export interface HistoryEntry {
  key: string
  title: string
  groupTitle: string
  path: string
  at: number
}

export interface ParseRecord {
  input: string
  title: string
  kind: MediaKind
  cover: string
  count: number
  at: number
}

/** preload 通过 contextBridge 暴露给渲染进程的接口 */
export interface BiliApi {
  auth: {
    check(): Promise<AuthState>
    openLoginWindow(): Promise<AuthState>
    listBrowsers(): Promise<BrowserProfile[]>
    importFromBrowser(id: string): Promise<AuthState>
    /** 手动粘贴的 Cookie：分号分隔或浏览器插件导出的 JSON */
    importCookie(text: string): Promise<AuthState>
    logout(): Promise<AuthState>
    simulateExpiry(): Promise<void>
    onRequired(cb: () => void): () => void
    onChanged(cb: (state: AuthState) => void): () => void
  }
  parse(input: string): Promise<ParseResult>
  /** 加载分页来源的下一页 */
  parseMore(source: PagedSource, page: number): Promise<PageResult>
  /** 多个链接逐个解析（间隔 0.5 秒，避免触发风控） */
  parseBatch(inputs: string[]): Promise<ParseResult>
  onParseProgress(cb: (p: { done: number; total: number; title?: string }) => void): () => void
  streamInfo(item: MediaItem): Promise<StreamInfo>
  /** 当前账号创建的收藏夹 */
  myFavFolders(): Promise<{ id: number; title: string; count: number }[]>
  download: {
    /** 返回无法加入队列的提示（例如列表里有失效视频） */
    enqueue(req: EnqueueRequest): Promise<string | undefined>
    list(): Promise<TaskInfo[]>
    pause(id: string): Promise<void>
    pauseMany(ids: string[]): Promise<void>
    pauseAll(): Promise<void>
    resume(id: string): Promise<void>
    resumeMany(ids: string[]): Promise<void>
    resumeAll(): Promise<void>
    /** 从列表移除并删除没下载完的部分；deleteFiles 时已完成的也永久删除视频和附加文件 */
    remove(ids: string[], deleteFiles: boolean): Promise<void>
    retry(id: string): Promise<void>
    /** 删除已下载的部分，从头开始 */
    redownload(id: string): Promise<void>
    clearFinished(): Promise<void>
    onUpdate(cb: (tasks: TaskInfo[]) => void): () => void
  }
  history: {
    /** 已下载过的条目 key */
    downloadedKeys(): Promise<string[]>
    clearDownloads(): Promise<void>
    parses(): Promise<ParseRecord[]>
    removeParse(input: string): Promise<ParseRecord[]>
    clearParses(): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    chooseDir(): Promise<Settings>
  }
  subs: {
    list(): Promise<Subscription[]>
    add(req: NewSubscription): Promise<Subscription[]>
    update(id: string, patch: Partial<Pick<Subscription, 'enabled' | 'intervalMin' | 'options'>>): Promise<Subscription[]>
    remove(id: string): Promise<Subscription[]>
    check(id: string): Promise<Subscription[]>
    onUpdate(cb: (subs: Subscription[]) => void): () => void
  }
  net: {
    /** 当前网络连接方式的说明，例如“通过 http://127.0.0.1:7890 连接” */
    status(): Promise<string>
    /** 测试能否连上 B站，返回耗时毫秒 */
    test(): Promise<number>
    cdnHosts(): Promise<{ host: string; label: string }[]>
    pingCdn(): Promise<{ host: string; ms: number | null }[]>
  }
  config: {
    exportTo(): Promise<string | null>
    importFrom(): Promise<string | null>
  }
  mcp: {
    status(): Promise<{ running: boolean; error?: string }>
    regenerateToken(): Promise<Settings>
  }
  app: {
    /** 用户点了关闭按钮，需要询问退出还是后台运行 */
    onCloseRequested(cb: () => void): () => void
    close(action: Exclude<CloseAction, 'ask'>, remember: boolean): Promise<void>
  }
  update: {
    state(): Promise<UpdateState>
    /** 手动检查，跳过的版本也会提示 */
    check(): Promise<UpdateState>
    download(): Promise<void>
    cancel(): Promise<void>
    /** 退出、替换应用并重新打开 */
    install(): Promise<void>
    skip(): Promise<void>
    openPage(): Promise<void>
    onState(cb: (state: UpdateState) => void): () => void
    /** 自动检查发现了没跳过的新版本 */
    onPrompt(cb: () => void): () => void
  }
  readClipboard(): Promise<string>
  writeClipboard(text: string): Promise<void>
  showInFolder(path: string): Promise<void>
  openFullDiskAccessSettings(): Promise<void>
}
