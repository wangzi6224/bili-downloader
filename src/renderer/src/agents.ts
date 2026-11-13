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

/** 本机没检测到、也还没装的：主按钮换成“仍要安装”，点了先确认 */
export const needsForce = (a: AgentStatus): boolean => a.supported && !a.detected && !a.installed

/**
 * 检测到的排前面，没检测到的其次，这个系统上没有的放最后；同一组里保持原来的顺序。
 * 只按检测结果分组，安装、移除不会让这一行跳到别处
 */
export function sortAgents(list: AgentStatus[]): AgentStatus[] {
  const rank = (a: AgentStatus): number => (!a.supported ? 2 : a.detected ? 0 : 1)
  return [...list].sort((x, y) => rank(x) - rank(y))
}
