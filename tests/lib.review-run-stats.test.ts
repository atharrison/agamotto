import {
  formatTokenUsage,
  pipelineFailureErrorMessage,
  tokenBudgetErrorMessage,
  tokenBudgetOverageFromError,
  tokenBudgetOverageFromMessage,
  tokenBudgetStats,
} from '../src/lib/review-run-stats'

describe('tokenBudgetOverageFromError', () => {
  it('returns null for non-objects and other errors', () => {
    expect(tokenBudgetOverageFromError(null)).toBeNull()
    expect(tokenBudgetOverageFromError('nope')).toBeNull()
    expect(tokenBudgetOverageFromError(new Error('boom'))).toBeNull()
  })

  it('reads TokenBudgetError name and fields', () => {
    expect(
      tokenBudgetOverageFromError({
        name: 'TokenBudgetError',
        tokensUsed: 167123,
        maxTokens: 150000,
        cost: 1.23456,
      })
    ).toEqual({
      tokensUsed: 167123,
      maxTokens: 150000,
      cost: 1.23456,
    })
  })

  it('defaults cost to 0 when omitted', () => {
    expect(
      tokenBudgetOverageFromError({
        name: 'TokenBudgetError',
        tokensUsed: 10,
        maxTokens: 5,
      })
    ).toEqual({ tokensUsed: 10, maxTokens: 5, cost: 0 })
  })

  it('returns null when name matches but fields are missing', () => {
    expect(tokenBudgetOverageFromError({ name: 'TokenBudgetError' })).toBeNull()
  })
})

describe('tokenBudgetOverageFromMessage', () => {
  it('parses the loop error message', () => {
    expect(
      tokenBudgetOverageFromMessage('Token budget exceeded: 167123 > 150000')
    ).toEqual({ tokensUsed: 167123, maxTokens: 150000, cost: 0 })
  })

  it('parses String(err) which prefixes the class name', () => {
    expect(
      tokenBudgetOverageFromMessage(
        'TokenBudgetError: Token budget exceeded: 167123 > 150000'
      )
    ).toEqual({ tokensUsed: 167123, maxTokens: 150000, cost: 0 })
  })

  it('returns null when the message is unrelated', () => {
    expect(tokenBudgetOverageFromMessage('pipeline exploded')).toBeNull()
  })
})

describe('tokenBudgetStats', () => {
  const overage = { tokensUsed: 167123, maxTokens: 150000, cost: 1.23456 }

  it('omits cost and duration when extras are absent (ERROR replay)', () => {
    expect(tokenBudgetStats(overage)).toEqual({
      tokensUsed: 167123,
      maxTokens: 150000,
      findingsCount: 0,
      phaseDurations: {},
    })
  })

  it('includes rounded cost and duration for a live failure', () => {
    expect(
      tokenBudgetStats(overage, { includeCost: true, durationMs: 14100 })
    ).toEqual({
      tokensUsed: 167123,
      maxTokens: 150000,
      estimatedCostUsd: 1.2346,
      durationMs: 14100,
      findingsCount: 0,
      phaseDurations: {},
    })
  })

  it('includes duration even when it is zero', () => {
    const stats = tokenBudgetStats(overage, {
      includeCost: true,
      durationMs: 0,
    })
    expect(stats.durationMs).toBe(0)
    expect(stats.estimatedCostUsd).toBe(1.2346)
  })
})

describe('formatTokenUsage', () => {
  it('shows tokens only when no budget is known', () => {
    expect(formatTokenUsage(1200)).toBe('1,200 tokens')
  })

  it('shows used / limit when under budget', () => {
    expect(formatTokenUsage(1200, 200000)).toBe('1,200 / 200,000 tokens')
  })

  it('shows overage when used exceeds the budget', () => {
    expect(formatTokenUsage(167123, 150000)).toBe(
      '167,123 / 150,000 tokens (over by 17,123)'
    )
  })
})

describe('pipelineFailureErrorMessage', () => {
  it('returns the generic pipeline copy for other errors', () => {
    expect(pipelineFailureErrorMessage(new Error('boom'))).toBe(
      'Review pipeline failed. Check server logs for details.'
    )
  })

  it('includes overage for TokenBudgetError', () => {
    expect(
      pipelineFailureErrorMessage({
        name: 'TokenBudgetError',
        tokensUsed: 167123,
        maxTokens: 150000,
        cost: 0,
      })
    ).toBe('Token budget exceeded: 167,123 used of 150,000 (over by 17,123).')
  })
})

describe('tokenBudgetErrorMessage', () => {
  it('never reports a negative overage', () => {
    expect(
      tokenBudgetErrorMessage({
        tokensUsed: 100,
        maxTokens: 200,
        cost: 0,
      })
    ).toBe('Token budget exceeded: 100 used of 200 (over by 0).')
  })
})
