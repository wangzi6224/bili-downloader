// main / preload / renderer 共用的数据类型
import type { Lang, LanguageSetting } from './i18n'
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
  /** 没有权限读取：macOS 上是隐私保护拦截了，需要给本应用“完全磁盘访问权限”；Linux 上是文件夹权限不允许 */
  blocked?: boolean
  /** 浏览器正在运行，Cookie 数据库被它锁着（Windows 上的 Chrome 系浏览器），要先退出浏览器 */
  locked?: boolean
  /** 同一浏览器里最近用过的配置档 */
  lastUsed?: boolean
  /** Windows 上这个浏览器启用了应用绑定加密（v20）：退出浏览器后也可能读不出登录信息 */
  appBound?: boolean
  /** Windows 上这个配置档的 B站登录（SESSDATA）是应用绑定加密的：只有浏览器自己读得出，无法导入，要改用扫码或手动粘贴 */
  appBoundLogin?: boolean
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
  /** 去水印：下载后自动识别画面角落的水印并去掉（要重新编码视频）。auto 是快速（delogo），ai 是 AI 精修 */
  watermark: WatermarkMode
}

export type WatermarkMode = 'off' | 'auto' | 'ai'

/** 水印区域：视频显示方向（已按旋转转正）下原分辨率的像素坐标 */
export interface WatermarkRegion {
  x: number
  y: number
  w: number
  h: number
}

export interface WatermarkState {
  /** 视频显示尺寸，界面换算坐标用 */
  width: number
  height: number
  /** 自动识别到的位置（分数够“建议位置”就有） */
  detected?: WatermarkRegion
  /** 认出了 B站水印（标志和昵称都对上），可以放心提醒用户去水印 */
  found?: boolean
  /** 当前文件里已经去掉的位置 */
  applied?: WatermarkRegion
}

/**
 * 去水印的进度；manual 表示对已完成任务手动发起（此时 status 仍为 done）。
 * AI 精修的阶段：model（第一次用时下载模型）→ analyze（抽帧找笔画、加载模型）→ refine（逐帧修补并编码）
 */
export interface ProcessingInfo {
  manual?: boolean
  stage: 'detect' | 'queue' | 'encode' | 'model' | 'analyze' | 'refine'
  /** 0-100 */
  pct?: number
  /** 剩余秒数 */
  eta?: number
  /** AI 精修用的推理方式，例如“GPU”“CPU × 6” */
  backend?: string
}

/** 手动去水印的方式：fast 用 delogo（快，略糊）；ai 用 LaMa 模型逐帧修补（慢，清楚） */
export type WatermarkMethod = 'fast' | 'ai'

/** AI 精修模型的状态：第一次使用时下载 */
export interface AiModelStatus {
  state: 'missing' | 'downloading' | 'ready' | 'error'
  /** 模型大小（字节） */
  size: number
  /** 已下载的字节数 */
  done?: number
  /** 正在从哪里下载，例如 ModelScope */
  source?: string
  /** 下载完在校验 */
  verifying?: boolean
  message?: string
  /** 模型和缓存一共占用的磁盘空间（字节） */
  disk?: number
}

/** 去水印的速度：处理耗时约为视频时长的几倍；measured 是这台机器实测的，calibrated 按试跑，default 是保守的默认值 */
export interface WatermarkSpeedInfo {
  ratio: [number, number]
  basis: 'measured' | 'calibrated' | 'default'
  /** AI 精修用的推理方式，例如 GPU、CPU × 6 */
  backend?: string
}

export interface WatermarkSpeed {
  fast: WatermarkSpeedInfo
  ai: WatermarkSpeedInfo
}

/** AI 精修开始前的估算 */
export interface AiEstimate {
  /** 预计耗时 [乐观, 保守]，秒 */
  seconds: [number, number]
  backend: 'webgpu' | 'coreml' | 'cpu'
  /** 显示用，例如“GPU”“CPU × 6” */
  label: string
  frames: number
  /** 画面静止、能沿用上一帧结果的比例 */
  reuse: number
  /** 没认出水印的笔画，整个方框都会重画 */
  fallback: boolean
}

/** 去水印对话框打开时需要的信息 */
export interface WatermarkPrep {
  width: number
  height: number
  /** 秒 */
  duration: number
  /** 预览帧所在的时间（秒） */
  time: number
  /** data:image/jpeg;base64,... */
  image: string
  /** 建议的位置：识别到的，或者右上角的默认框 */
  region: WatermarkRegion
  /** region 是不是识别出来的 */
  detected: boolean
  applied?: WatermarkRegion
  /** 不能处理的原因（HDR、杜比视界…），有值时界面禁用“开始处理” */
  blocker?: string
}

export interface EnqueueRequest {
  title: string
  cover: string
  kind: MediaKind
  meta?: MediaMeta
  items: MediaItem[]
  options: DownloadOptions
  /** MCP 批量下载的批次 id */
  batchId?: string
  /** 保存到这个目录（绝对路径），默认是设置里的下载目录 */
  dir?: string
  /** 一次下载被拆成几次加入时，按整批是否多个条目选命名模板 */
  multi?: boolean
  /** 加入后先暂停，不开始下载 */
  paused?: boolean
}

export type TaskStatus =
  | 'queued'
  | 'fetching'
  | 'downloading'
  | 'merging'
  | 'extras'
  /** 自动去水印：识别、排队等转码、转码 */
  | 'processing'
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
  /** 实际下载的清晰度代码（低于 options.qn 说明降了档） */
  videoQn?: number
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
  /** 通过 MCP 批量下载加入时的批次 id */
  batchId?: string
  /** 去水印的识别和处理结果 */
  watermark?: WatermarkState
  /** 正在去水印时的阶段和进度 */
  processing?: ProcessingInfo
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
  /** 稍后再看属于登录账号 */
  accountMid?: number
  /** 已经见过的条目 key，只有之后新增的才会下载 */
  seen: string[]
  /** 已发现但尚未成功展开分 P 的条目 */
  pending?: MediaItem[]
  createdAt: number
  lastCheck?: number
  lastNew?: number
  lastError?: string
  /**
   * UP 主空间里正序的合集、系列已经把最后一页记为已见，之后每次从最后一页往前找新内容。
   * 早先的订阅只记下了第一页，没有这个标记时先补记最后一页，免得把中间的旧视频当成新的
   */
  tailBaseline?: boolean
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

export type AccountSourceCategory = 'anime' | 'cinema' | 'collected' | 'folders'

export type AccountSourceTarget =
  | { type: 'pgc'; seasonId: number }
  | { type: 'spaceSeason'; ownerMid: number; seasonId: number }
  | { type: 'fav'; mediaId: number }
  | { type: 'watchlater' }

export type SourceRef =
  | { type: 'subscription'; id: string }
  | { type: 'account'; mid: number; target: AccountSourceTarget }

export interface SourceDetails {
  result: ParseResult
  accountMid?: number
}

export interface AccountSource {
  key: string
  title: string
  cover?: string
  target: AccountSourceTarget
}

export interface AccountSourcePage {
  items: AccountSource[]
  hasMore: boolean
}

export interface SourceDownloadResult {
  title: string
  subscribed: boolean
  count: number
  note?: string
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
  /** 每个文件同时开几个连接分段下载 */
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
  /** 界面语言，system 跟随系统（系统语言不支持时用英语） */
  language: LanguageSetting
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
/** 当前网络连接方式 */
export interface NetworkStatus {
  /** 给用户看的说明，例如“通过 http://127.0.0.1:7890 连接” */
  text: string
  /** 代理设置有误、已退回直连；界面据此标红，不要看 text 的内容 */
  error: boolean
}

export interface BiliApi {
  /** 主进程的 process.platform，界面按它调整文案和布局 */
  platform: string
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
  sources: {
    listAccount(mid: number, category: AccountSourceCategory, page: number): Promise<AccountSourcePage>
    open(source: SourceRef): Promise<SourceDetails>
    prepareItems(items: MediaItem[], accountMid?: number): Promise<{ items: MediaItem[]; note?: string }>
    subscribeDownload(source: SourceRef): Promise<SourceDownloadResult>
  }
  download: {
    /** 返回无法加入队列的提示（例如列表里有失效视频） */
    enqueue(req: EnqueueRequest, accountMid?: number): Promise<string | undefined>
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
    /** 清除已完成和无法下载的任务；deleteFiles 时同时永久删除已完成任务的视频和附加文件 */
    clearFinished(deleteFiles: boolean): Promise<void>
    onUpdate(cb: (tasks: TaskInfo[]) => void): () => void
  }
  watermark: {
    /** 打开去水印对话框：抽一帧画面并给出建议位置 */
    prepare(taskId: string): Promise<WatermarkPrep>
    /** 换一帧；带 region 时返回去掉水印后的效果 */
    frame(taskId: string, time: number, region?: WatermarkRegion): Promise<string>
    /** 开始处理，进度通过任务列表更新；method 默认 fast */
    start(taskId: string, region: WatermarkRegion, method?: WatermarkMethod): Promise<void>
    cancel(taskId: string): Promise<void>
    /** AI 精修模型的状态，以及下载、取消、删除 */
    aiStatus(): Promise<AiModelStatus>
    aiDownload(): Promise<void>
    aiCancelDownload(): Promise<void>
    aiRemove(): Promise<void>
    onAiStatus(cb: (s: AiModelStatus) => void): () => void
    /** 估算 AI 精修的耗时（要先下载模型；第一次会加载模型、试跑几秒） */
    aiEstimate(taskId: string, region: WatermarkRegion): Promise<AiEstimate>
    /** AI 精修后这一帧的样子 */
    aiPreview(taskId: string, time: number, region: WatermarkRegion): Promise<string>
    /** 对话框关掉时释放为预览开的推理进程 */
    aiRelease(taskId: string): Promise<void>
    /** 两种方式在这台机器上大约是视频时长的几倍 */
    speed(): Promise<WatermarkSpeed>
  }
  history: {
    /** 已下载过的条目 key */
    downloadedKeys(): Promise<string[]>
    onDownloadsChanged(cb: () => void): () => void
    clearDownloads(): Promise<void>
    parses(): Promise<ParseRecord[]>
    removeParse(input: string): Promise<ParseRecord[]>
    clearParses(): Promise<void>
  }
  i18n: {
    /** 实际生效的界面语言 */
    get(): Promise<Lang>
    onChanged(cb: (lang: Lang) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    chooseDir(): Promise<Settings>
    /** 设置在别处（例如 MCP）被修改 */
    onChanged(cb: (settings: Settings) => void): () => void
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
    status(): Promise<NetworkStatus>
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
    /** 用户从托盘菜单点了“设置” */
    onOpenSettings(cb: () => void): () => void
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
