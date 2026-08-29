import { buildContextAgentUserMessage } from '../src/agents/pr-review/context-agent'
import {
  CONTEXT_AGENT_SYSTEM,
  PRIOR_ROUNDS_NOTE,
} from '../src/agents/pr-review/prompts'

describe('buildContextAgentUserMessage', () => {
  it('instructs search_past_reviews for cross-PR patterns', () => {
    const msg = buildContextAgentUserMessage(
      'https://github.com/org/repo/pull/1',
      []
    )
    expect(msg).toContain('https://github.com/org/repo/pull/1')
    expect(msg).toContain('search_past_reviews')
    expect(msg).not.toContain('Prior rounds of THIS pull request')
  })

  it('injects this-PR prior rounds so the agent does not have to discover them', () => {
    const msg = buildContextAgentUserMessage(
      'https://github.com/org/repo/pull/1',
      [
        {
          reviewId: 'rev-old',
          reviewedAt: '2026-08-16T00:00:00Z',
          summary: 'Auth leak',
          findings: [
            {
              severity: 'BLOCKING',
              category: 'SECURITY',
              file: 'src/auth.ts',
              title: 'Token not cleared on reject',
              action: 'ACCEPT',
            },
          ],
        },
      ]
    )
    expect(msg).toContain('Prior rounds of THIS pull request')
    expect(msg).toContain('Token not cleared on reject')
    expect(msg).toContain('Copy priorRounds into EnrichedContext as-is')
  })
})

describe('CONTEXT_AGENT_SYSTEM', () => {
  it('tells the agent to search other PRs, not rediscover this PR', () => {
    expect(CONTEXT_AGENT_SYSTEM).toContain('search_past_reviews')
    expect(CONTEXT_AGENT_SYSTEM).toContain('other PRs')
    expect(CONTEXT_AGENT_SYSTEM).toContain('priorRounds')
  })
})

describe('PRIOR_ROUNDS_NOTE', () => {
  it('tells domain agents not to re-raise fixed issues', () => {
    expect(PRIOR_ROUNDS_NOTE).toContain('priorRounds')
    expect(PRIOR_ROUNDS_NOTE).toContain('clearly fixed')
    expect(PRIOR_ROUNDS_NOTE).toContain('REJECT')
  })
})
