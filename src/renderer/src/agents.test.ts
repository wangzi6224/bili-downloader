import { describe, expect, it } from 'vitest'
import type { AgentStatus } from '@shared/types'
import { agentHint, agentTone } from './agents'

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
