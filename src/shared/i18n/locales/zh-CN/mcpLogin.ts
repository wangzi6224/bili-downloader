// MCP 登录工具：start_login / get_login_status 的说明、提示，以及登录流程的失败原因
export default {
  startTitle: '登录 B站',
  startDesc:
    '应用没有登录时用它登录。默认导入用户浏览器里的登录信息：按 Chrome、其他 Chrome 系、Opera、Firefox、Safari 的顺序，先用能直接读到的；Cookie 只保存在应用里，结果不包含它。' +
    '导入不成时按返回的 next 操作，next=try_qr 时告诉用户后用 method=qr 弹出扫码窗口，再用 get_login_status 带 wait_seconds 等登录完成。' +
    '已经登录时什么都不做，切换账号要用户在应用里操作。浏览器需要关闭时由应用弹窗问用户本人，这里没有直接关闭的参数。',
  startMethod: 'browser 从浏览器导入（默认）；qr 弹出登录窗口让用户扫码',
  startSource: '指定浏览器，如 chrome、edge、opera、firefox、safari，或 get_login_status 列出的配置档 id。不传时自动选择',
  startWait: '最多等待多少秒，默认 {n}。登录完成、失败或需要用户操作时立即返回',

  statusTitle: '查看登录进度',
  statusDesc:
    '查看 start_login 的进度。wait_seconds 大于 0 时会等到登录成功、失败或状态变化才返回：登录成功的那一刻立即返回，这就是扫码完成的通知，比反复查询省事。' +
    '用户在应用里自己登录也算。超时还是 waiting_user 就再调用一次。include_browsers=true 时列出本机浏览器和里面有没有 B站登录。',
  statusWait: '最多等待多少秒，默认 0',
  statusBrowsers: '是否列出本机的浏览器，默认 false',

  // 失败后的下一步（按 reason）
  hintLocked: '浏览器正在运行。可以让用户完全退出浏览器（包括后台运行的）后再试，或改用扫码',
  hintAppBound: '这个浏览器用应用绑定加密保护登录信息，读不出来，请改用扫码',
  hintBlocked: '没有权限读取这个浏览器的数据。macOS 上要在系统设置里给 {appName}“完全磁盘访问权限”并重启应用，其他系统请检查文件夹权限，也可以改用扫码',
  hintNoLogin: '浏览器里没有 B站登录。用户刚在浏览器里登录的话，稍等半分钟再试（浏览器不是马上写入），或改用扫码',
  hintExpired: '浏览器里的 B站登录已失效，请改用扫码，或让用户先在浏览器里重新登录',
  hintKeychainDenied: '用户没有在钥匙串弹窗里点“允许”。问问用户是否要重试，或改用扫码',
  hintNetwork: '连不上 B站，或被风控拦下了，等一会儿再试',
  hintDeclined: '用户不同意关闭浏览器，不要反复重试。问问用户是否要用 start_login method=qr 扫码',
  hintConfirmTimeout: '用户没有回答对话框，可能没看到。提醒用户留意后再试，或改用扫码',
  hintCloseFailed: '浏览器没能关闭。可以让用户手动退出后再试，或改用扫码',
  hintWindowClosed: '用户关掉了登录窗口。问问用户是否要重新打开',
  hintNotFound: '可以用 get_login_status include_browsers=true 查看本机的浏览器，或改用扫码',
  hintFailed: '可以换一个浏览器，或改用扫码',

  // 进行中的步骤
  stepChecking: '正在确认登录状态。用 get_login_status wait_seconds=30 等结果',
  stepImporting: '正在读取浏览器里的登录信息。macOS 可能弹出钥匙串授权，Linux 可能要解锁密钥环，请提醒用户点“允许”。用 get_login_status wait_seconds=30 等结果',
  stepConfirmClose: '应用弹出了是否关闭浏览器的对话框，请提醒用户回答。用 get_login_status wait_seconds=30 等结果',
  stepClosingBrowser: '用户同意了，正在关闭浏览器。用 get_login_status wait_seconds=30 等结果',
  stepQr: '登录窗口已经打开，请告诉用户用 B站 App 扫码。用 get_login_status wait_seconds=50 等结果，登录成功时会立即返回，超时就再调用一次',

  interrupted: '这些批次之前被打断了，用 control_tasks action=resume batch_id=… 继续',

  // 登录流程的失败说明（snapshot.message）
  qrClosed: '登录窗口已关闭，但还没有登录成功',
  sourceNotFound: '没有找到“{source}”，可以用 get_login_status include_browsers=true 查看本机的浏览器',
  appBoundLogin: '{browser} 里的 B站登录用应用绑定加密保存，只有浏览器自己读得出，请改用扫码',
  appBoundLocked: '{browser} 启用了应用绑定加密，退出后也很可能读不出登录信息',
  browserRunning: '{browser} 正在运行，需要用户手动退出后再导入',
  noPermission: '没有权限读取 {browser} 的数据',
  noLoginIn: '{browser} 里没有 B站登录信息',
  noBrowser: '没有找到支持的浏览器',
  noLoginReadable: '能读取的浏览器里都没有 B站登录信息，{browser} 没有读取权限',
  noLoginAny: '找到的浏览器里都没有 B站登录信息',
  confirmTimeout: '用户没有回答是否关闭 {browser} 的对话框',
  declined: '用户不同意关闭 {browser}',
  closeFailed: '没能关闭 {browser}',
  closedNoLogin: '{browser} 已关闭，但里面没有 B站登录信息'
}
