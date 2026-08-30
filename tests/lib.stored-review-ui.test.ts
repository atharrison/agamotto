import { storedReviewUiState } from '../src/lib/stored-review-ui'

const blocking = {
  id: 'b-1',
  severity: 'BLOCKING' as const,
  category: 'CORRECTNESS',
  file: 'a.ts',
  title: 'missing check',
  body: 'add a check',
  confidence: 0.9,
}

const lowConfidence = {
  id: 'b-low',
  severity: 'BLOCKING' as const,
  category: 'CORRECTNESS',
  file: 'a.ts',
  title: 'hedged blocker',
  body: 'maybe not',
  confidence: 0.65,
}

const nit = {
  id: 'n-1',
  severity: 'NIT' as const,
  category: 'STYLE',
  file: 'a.ts',
  title: 'naming',
  body: 'rename',
  confidence: 0.5,
}

describe('storedReviewUiState', () => {
  it('returns null when there is no stored result', () => {
    expect(storedReviewUiState(null)).toBeNull()
    expect(storedReviewUiState(undefined)).toBeNull()
  })

  it('hydrates findings, default decisions, and a completed pipeline', () => {
    const state = storedReviewUiState({
      blockingIssues: [blocking, lowConfidence],
      suggestions: [],
      nits: [nit],
    })

    expect(state).not.toBeNull()
    expect(state!.status).toBe('done')
    expect(state!.isCachedReview).toBe(true)
    expect(state!.findings).toEqual([blocking, lowConfidence, nit])
    expect(state!.decisions).toEqual({
      'b-1': { findingId: 'b-1', accepted: true },
      'b-low': { findingId: 'b-low', accepted: false },
      'n-1': { findingId: 'n-1', accepted: false },
    })
    expect(state!.phaseStatuses).toEqual({
      INPUT: 'done',
      CONTEXT: 'done',
      DOMAIN: 'done',
      OUTPUT: 'done',
    })
    expect(state!.activity.map(a => a.text)).toEqual([
      '⚡ Loaded saved review',
      '🎉 Review complete',
    ])
  })

  it('treats missing finding arrays as empty', () => {
    const state = storedReviewUiState({})
    expect(state!.findings).toEqual([])
    expect(state!.decisions).toEqual({})
    expect(state!.status).toBe('done')
  })
})
