// 请求抖音接口的通道。现在的实现是“页面桥”：在隐藏窗口打开抖音网页，用网页自己的脚本给请求签名

/** 允许请求的接口；页面里执行的请求路径只能从这里取 */
export const DY_PATHS = {
  detail: '/aweme/v1/web/aweme/detail/',
  posts: '/aweme/v1/web/aweme/post/',
  likes: '/aweme/v1/web/aweme/favorite/',
  collection: '/aweme/v1/web/aweme/listcollection/',
  folders: '/aweme/v1/web/collects/list/',
  folderItems: '/aweme/v1/web/collects/video/list/',
  mixItems: '/aweme/v1/web/mix/aweme/',
  mixDetail: '/aweme/v1/web/mix/detail/',
  mixCollections: '/aweme/v1/web/mix/listcollection/',
  userMixes: '/aweme/v1/web/mix/list/',
  watchLater: '/aweme/v1/web/watchlater/list/',
  history: '/aweme/v1/web/history/read/',
  following: '/aweme/v1/web/user/following/list/',
  profile: '/aweme/v1/web/user/profile/other/',
  self: '/aweme/v1/web/user/profile/self/',
  searchVideos: '/aweme/v1/web/search/item/',
  searchUsers: '/aweme/v1/web/discover/search/',
  comments: '/aweme/v1/web/comment/list/',
  replies: '/aweme/v1/web/comment/list/reply/',
  danmaku: '/aweme/v1/web/danmaku/get_v2/'
} as const

export type DyEndpoint = keyof typeof DY_PATHS

export interface DyRequest {
  endpoint: DyEndpoint
  method?: 'GET' | 'POST'
  query?: Record<string, string>
  body?: Record<string, string>
}

export interface DyRawResponse {
  status: number
  body: string
}

export interface DyRequestOptions {
  /** 用哪个账号的会话；null 是匿名 */
  account: string | null
  signal?: AbortSignal
}

export interface DouyinTransport {
  /** 页面弹出验证时抛 DyVerifyError */
  request(req: DyRequest, o: DyRequestOptions): Promise<DyRawResponse>
  /** 亮出窗口让用户手动完成验证：重发 probe，用户完成后返回它的响应 */
  verify(account: string | null, probe: DyRequest, signal?: AbortSignal): Promise<DyRawResponse>
  /** 关掉某个账号（undefined 为全部）的页面 */
  dispose(account?: string | null): void
}
