// MCP 批次状态里给 AI 的下一步提示
export default {
  expanding: '正在获取视频分P并分段加入队列（{done}/{total}），已加入的会先开始下载，可以带 wait_seconds 等待',
  interruptedError: '获取视频分P时出错（{error}），已经停下，还有 {count} 个条目没加入队列；过一会儿调用 control_tasks action=resume batch_id={id} 继续',
  interruptedQuit: '应用退出时还有 {count} 个条目没加入队列，调用 control_tasks action=resume batch_id={id} 继续',
  waitingAuth: '登录已失效，重新登录后会自动继续。{loginHint}',
  retrying: '下载中，{count} 个任务出错后在等待自动重试，可以带 wait_seconds 等待',
  downloading: '下载中，可以带 wait_seconds 等待',
  paused: '{count} 个任务已暂停（应用重启后未完成的任务会自动暂停），调用 control_tasks action=resume batch_id={id} 继续',
  retryFailed: '调用 control_tasks action=retry batch_id={id} 重试失败的',
  unsupported: '无法下载（unsupported）的多半需要大会员、有地区限制或是付费内容，重试没用',
  allDownloaded: '选中的条目都已经下载过'
}
