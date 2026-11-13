// 各 agent 的品牌图标（LobeHub Icons，MIT，见 assets/agents/LICENSE.md）；按 agent id 取
import claudeCode from './assets/agents/claude-code.svg?raw'
import claudeDesktop from './assets/agents/claude-desktop.svg?raw'
import codebuddy from './assets/agents/codebuddy.svg?raw'
import codex from './assets/agents/codex.svg?raw'
import cursor from './assets/agents/cursor.svg?raw'
import geminiCli from './assets/agents/gemini-cli.svg?raw'
import qoder from './assets/agents/qoder.svg?raw'
import qwenCode from './assets/agents/qwen-code.svg?raw'
import traeCn from './assets/agents/trae-cn.svg?raw'
import workbuddy from './assets/agents/workbuddy.svg?raw'

export const AGENT_ICONS: Record<string, string> = {
  'claude-code': claudeCode,
  'claude-desktop': claudeDesktop,
  codex,
  cursor,
  'gemini-cli': geminiCli,
  workbuddy,
  codebuddy,
  'trae-cn': traeCn,
  qoder,
  'qwen-code': qwenCode
}
