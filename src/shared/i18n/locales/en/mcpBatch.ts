// MCP 批次状态里给 AI 的下一步提示
import type { Messages } from '../types'

export default {
  expanding:
    'Fetching video parts and adding them to the queue in chunks ({done}/{total}); items already added start downloading first. You can wait with wait_seconds',
  interruptedError: {
    one: 'An error occurred while fetching video parts ({error}), so it stopped; {count} item hasn’t been added to the queue yet. After a while, call control_tasks action=resume batch_id={id} to continue',
    other:
      'An error occurred while fetching video parts ({error}), so it stopped; {count} items haven’t been added to the queue yet. After a while, call control_tasks action=resume batch_id={id} to continue'
  },
  interruptedQuit: {
    one: 'When the app quit, {count} item hadn’t been added to the queue yet. Call control_tasks action=resume batch_id={id} to continue',
    other: 'When the app quit, {count} items hadn’t been added to the queue yet. Call control_tasks action=resume batch_id={id} to continue'
  },
  waitingAuth: 'The login has expired; downloading will continue automatically after signing in again. {loginHint}',
  retrying: {
    one: 'Downloading; {count} task hit an error and is waiting to retry automatically. You can wait with wait_seconds',
    other: 'Downloading; {count} tasks hit errors and are waiting to retry automatically. You can wait with wait_seconds'
  },
  downloading: 'Downloading. You can wait with wait_seconds',
  paused: {
    one: '{count} task is paused (unfinished tasks are paused automatically after the app restarts). Call control_tasks action=resume batch_id={id} to continue',
    other: '{count} tasks are paused (unfinished tasks are paused automatically after the app restarts). Call control_tasks action=resume batch_id={id} to continue'
  },
  retryFailed: 'Call control_tasks action=retry batch_id={id} to retry the failed ones',
  unsupported: 'Items that can’t be downloaded (unsupported) usually require Bilibili Premium, are region-restricted or are paid content; retrying won’t help',
  allDownloaded: 'All selected items have already been downloaded'
} satisfies Messages['mcpBatch']
