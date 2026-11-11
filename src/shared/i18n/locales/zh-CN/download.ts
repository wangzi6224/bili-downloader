// 下载、合并、附加内容（封面、字幕、弹幕）相关的报错和提示
export default {
  // errors.ts：文件系统错误
  diskFull: '磁盘空间不足',
  /** 拼在下面几条报错后面，指出出错的路径 */
  atPath: '：{path}',
  noWritePermission: '没有写入权限{where}',
  readOnlyDisk: '目标磁盘是只读的{where}',
  dirMissing: '下载目录不存在或外接磁盘已断开{where}',
  writeFailed: '写入文件失败（{code}）{where}',

  // extras.ts
  coverFailed: '封面下载失败：{error}',
  noCcSubtitle: '没有 CC 字幕',
  subtitleFailed: '字幕/章节获取失败：{error}',
  danmakuFailed: '弹幕下载失败：{error}',
  coverSaveFailed: '封面保存失败：{error}',
  subtitleSaveFailed: '字幕保存失败：{error}',
  danmakuSaveFailed: '弹幕保存失败：{error}',
  nfoSaveFailed: 'NFO保存失败：{error}',
  embedFallback: '封面/字幕/章节写入视频失败，已改为单独保存',

  // fetchFile.ts
  sizeFailed: '获取文件大小失败（HTTP {status}）',
  connectFailed: '连接下载服务器失败：{error}',
  timeout: '连接超时',
  httpFailed: '下载失败（HTTP {status}）',
  badRange: '服务器返回的数据区间不对',
  interrupted: '连接中断',
  incomplete: '文件不完整（{done}/{total}）',

  // manager.ts
  deleteFailed: '有 {count} 个文件没能删除：{files}',
  busy: '这个视频正在处理，请等它结束',
  badRegion: '水印区域无效',
  fileLocked: '原视频正被其他程序占用，没能替换',

  // mux.ts：ffmpeg 报错，action 是下面三个之一
  actionMux: '合并',
  actionWatermark: '去水印',
  actionRead: '读取视频',
  ffNoSpace: '{action}失败：磁盘空间不足',
  ffNoPermission: '{action}失败：没有写入目标目录的权限',
  ffLogoOutside: '{action}失败：水印位置超出了画面',
  ffEncoder: '{action}失败：编码器不可用',
  ffCorrupt: '{action}失败：下载的文件已损坏，请点“重新下载”',
  ffContainer: '合并失败：这种编码放不进当前封装格式，请在设置里改用 MKV',
  ffExit: '{action}失败（ffmpeg 退出码 {code}）：{detail}',
  ffSpawn: '无法运行 ffmpeg：{error}',
  muxTimeout: '合并超时，ffmpeg 没有响应'
}
