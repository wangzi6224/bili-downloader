import { describe, expect, it } from 'vitest'
import type { AgentStatus } from '@shared/types'
import { agentHint, agentTone, needsForce, sortAgents } from './agents'

const base: AgentStatus = {
  id: 'x',
  name: 'X',
  supported: true,
  detected: false,
  installed: false,
  outdated: false,
  skill: true,
  configFile: '/x',
  note: 'none'
}

describe('agentHint', () => {
  it('按优先级给出状态和配色', () => {
    const cases: [Partial<AgentStatus>, string, string][] = [
      [{ supported: false, installed: true }, 'unsupported', 'neutral'],
      [{ broken: true, installed: true }, 'broken', 'danger'],
      [{ installed: true, outdated: true }, 'outdated', 'warn'],
      [{ installed: true }, 'installed', 'success'],
      [{ detected: true }, 'available', 'info'],
      [{}, 'notDetected', 'neutral']
    ]
    for (const [patch, hint, tone] of cases) {
      expect(agentHint({ ...base, ...patch })).toBe(hint)
      expect(agentTone({ ...base, ...patch })).toBe(tone)
    }
  })
})

describe('needsForce', () => {
  it('本机没检测到、也还没装的才要“仍要安装”', () => {
    expect(needsForce(base)).toBe(true)
    expect(needsForce({ ...base, detected: true })).toBe(false)
    expect(needsForce({ ...base, installed: true })).toBe(false)
    expect(needsForce({ ...base, supported: false })).toBe(false)
  })
})

describe('sortAgents', () => {
  it('检测到的在前，没检测到的其次，系统上没有的最后；组内保持原顺序，装没装不影响位置', () => {
    const list: AgentStatus[] = [
      { ...base, id: 'a', supported: false },
      { ...base, id: 'b' },
      { ...base, id: 'c', detected: true },
      { ...base, id: 'd', installed: true },
      { ...base, id: 'e', detected: true, installed: true }
    ]
    expect(sortAgents(list).map((a) => a.id)).toEqual(['c', 'e', 'b', 'd', 'a'])
    expect(list[0].id).toBe('a')
  })
})
