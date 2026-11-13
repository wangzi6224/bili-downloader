import { describe, expect, it } from 'vitest'
import { AGENTS } from '../../main/agents/registry'
import { AGENT_ICONS } from './agentIcons'

describe('AGENT_ICONS', () => {
  it('每个 agent 都有 SVG 图标', () => {
    for (const a of AGENTS) expect(AGENT_ICONS[a.id], a.id).toMatch(/^<svg[\s\S]*<\/svg>\s*$/)
  })
})
