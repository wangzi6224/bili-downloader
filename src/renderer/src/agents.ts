import type { AgentStatus } from '@shared/types'

/** 设置页 agent 列表里的状态标签：对应 agents.state_* 文案 */
export type AgentState = 'unsupported' | 'broken' | 'outdated' | 'installed' | 'notDetected' | 'available'

export function agentHint(a: AgentStatus): AgentState {
  if (!a.supported) return 'unsupported'
  if (a.broken) return 'broken'
  if (a.installed) return a.outdated ? 'outdated' : 'installed'
  return a.detected ? 'available' : 'notDetected'
}

const TONES = {
  unsupported: 'neutral',
  broken: 'danger',
  outdated: 'warn',
  installed: 'success',
  notDetected: 'neutral',
  available: 'info'
} as const

export const agentTone = (a: AgentStatus): (typeof TONES)[AgentState] => TONES[agentHint(a)]
