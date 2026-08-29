import {
  MAX_PRIOR_ROUNDS,
  PriorFindingAction,
  formatPriorRounds,
  priorRoundStats,
  formatPriorRoundsActivity,
  type CompleteReviewSource,
} from '../src/lib/prior-rounds'

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    severity: 'BLOCKING',
    category: 'SECURITY',
    file: 'src/auth.ts',
    line: 42,
    title: 'Token not cleared on reject',
    body: 'Long body that must not be injected',
    confidence: 0.9,
    ...overrides,
  }
}

function row(
  overrides: Partial<CompleteReviewSource> = {}
): CompleteReviewSource {
  return {
    id: 'rev-old',
    created_at: '2026-08-16T00:00:00Z',
    result: {
      summary: 'Auth callback leak',
      blockingIssues: [finding()],
      suggestions: [],
      nits: [],
    },
    submission: {
      reviewId: 'rev-old',
      decisions: [{ findingId: 'f1', action: 'ACCEPT' }],
      postToGitHub: true,
    },
    ...overrides,
  }
}

describe('MAX_PRIOR_ROUNDS', () => {
  it('caps injected history at 3 rounds', () => {
    expect(MAX_PRIOR_ROUNDS).toBe(3)
  })
})

describe('formatPriorRounds', () => {
  it('compacts findings and attaches the human action, dropping bodies', () => {
    const rounds = formatPriorRounds([row()])
    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toEqual({
      reviewId: 'rev-old',
      reviewedAt: '2026-08-16T00:00:00Z',
      summary: 'Auth callback leak',
      findings: [
        {
          severity: 'BLOCKING',
          category: 'SECURITY',
          file: 'src/auth.ts',
          line: 42,
          title: 'Token not cleared on reject',
          action: 'ACCEPT',
        },
      ],
    })
    expect(JSON.stringify(rounds)).not.toContain('Long body')
  })

  it('merges blocking, suggestion, and nit buckets in that order', () => {
    const rounds = formatPriorRounds([
      row({
        result: {
          summary: 'mixed',
          blockingIssues: [finding({ id: 'b', title: 'block' })],
          suggestions: [
            finding({
              id: 's',
              severity: 'SUGGESTION',
              category: 'CORRECTNESS',
              title: 'suggest',
            }),
          ],
          nits: [
            finding({
              id: 'n',
              severity: 'NIT',
              category: 'STYLE',
              title: 'nit',
              line: undefined,
            }),
          ],
        },
        submission: null,
      }),
    ])
    expect(rounds[0].findings.map(f => f.title)).toEqual([
      'block',
      'suggest',
      'nit',
    ])
    expect(rounds[0].findings[2].line).toBeUndefined()
    expect(rounds[0].findings[0].action).toBeUndefined()
  })

  it('reverses newest-first rows so agents see chronological order', () => {
    const rounds = formatPriorRounds([
      row({ id: 'rev-new', created_at: '2026-08-18T00:00:00Z' }),
      row({ id: 'rev-old', created_at: '2026-08-16T00:00:00Z' }),
    ])
    expect(rounds.map(r => r.reviewId)).toEqual(['rev-old', 'rev-new'])
  })

  it('skips rows with a missing or non-object result', () => {
    expect(
      formatPriorRounds([row({ result: null }), row({ result: 'nope' }), row()])
    ).toHaveLength(1)
  })

  it('omits action when the decision is missing or not a known enum', () => {
    const rounds = formatPriorRounds([
      row({
        submission: {
          decisions: [
            { findingId: 'f1', action: 'IGNORE' },
            { findingId: 'other', action: 'REJECT' },
          ],
        },
      }),
    ])
    expect(rounds[0].findings[0].action).toBeUndefined()
  })

  it('skips malformed findings that lack required fields', () => {
    const rounds = formatPriorRounds([
      row({
        result: {
          summary: 'partial',
          blockingIssues: [
            { title: 'no severity' },
            finding({ id: 'ok', title: 'kept' }),
            { severity: 'BLOCKING', category: 'SECURITY', file: 'a.ts' },
            finding({ id: 'empty-file', title: 'x', file: '' }),
            finding({
              id: 'bad-sev',
              title: 'bad sev',
              severity: 'CRITICAL',
            }),
            finding({
              id: 'bad-cat',
              title: 'bad cat',
              category: 'TYPOS',
            }),
            finding({ id: 'empty-title', title: '', file: 'src/auth.ts' }),
            finding({ id: 'frac-line', title: 'frac', line: 1.5 }),
            ['not', 'an', 'object'],
          ],
          suggestions: 'not-an-array',
          nits: null,
        },
      }),
    ])
    expect(rounds[0].findings.map(f => f.title)).toEqual(['kept', 'frac'])
    expect(rounds[0].findings[1].line).toBeUndefined()
  })

  it('skips non-object decisions and unknown finding ids', () => {
    const rounds = formatPriorRounds([
      row({
        submission: {
          decisions: [null, 'nope', { findingId: 'f1', action: 'ACCEPT' }],
        },
      }),
    ])
    expect(rounds[0].findings[0].action).toBe(PriorFindingAction.ACCEPT)
  })

  it('uses an empty summary when result.summary is absent', () => {
    const rounds = formatPriorRounds([
      row({
        result: {
          blockingIssues: [],
          suggestions: [],
          nits: [],
        },
      }),
    ])
    expect(rounds[0].summary).toBe('')
    expect(rounds[0].findings).toEqual([])
  })
})

describe('priorRoundStats', () => {
  it('counts rounds and findings', () => {
    expect(priorRoundStats([])).toEqual({ roundCount: 0, findingCount: 0 })
    expect(
      priorRoundStats([
        {
          reviewId: 'a',
          reviewedAt: '2026-08-16T00:00:00Z',
          summary: 'one',
          findings: [
            {
              severity: 'BLOCKING',
              category: 'SECURITY',
              file: 'a.ts',
              title: 'one',
            },
          ],
        },
        {
          reviewId: 'b',
          reviewedAt: '2026-08-17T00:00:00Z',
          summary: 'two',
          findings: [
            {
              severity: 'NIT',
              category: 'STYLE',
              file: 'b.ts',
              title: 'two',
            },
            {
              severity: 'NIT',
              category: 'STYLE',
              file: 'c.ts',
              title: 'three',
            },
          ],
        },
      ])
    ).toEqual({ roundCount: 2, findingCount: 3 })
  })
})

describe('formatPriorRoundsActivity', () => {
  it('says there are no prior review rounds when roundCount is 0', () => {
    expect(formatPriorRoundsActivity(0, 0)).toBe('No prior review rounds')
  })

  it('summarizes loaded findings on a re-review', () => {
    expect(formatPriorRoundsActivity(1, 1)).toBe(
      'Loaded 1 prior finding from 1 round of this PR'
    )
    expect(formatPriorRoundsActivity(2, 4)).toBe(
      'Loaded 4 prior findings from 2 rounds of this PR'
    )
  })
})
