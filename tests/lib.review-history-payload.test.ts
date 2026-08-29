import { reviewHistoryFields } from '../src/lib/review-history-payload'

describe('reviewHistoryFields', () => {
  it('reads summary and findings[] from a bare review object', () => {
    expect(
      reviewHistoryFields({
        summary: 'Found 3 issues',
        findings: [{}, {}, {}],
      })
    ).toEqual({ summary: 'Found 3 issues', findingCount: 3 })
  })

  it('unwraps the finalize { review, submission } envelope', () => {
    expect(
      reviewHistoryFields({
        review: {
          summary: 'Token leak in callback',
          blockingIssues: [{ id: 'f1' }, { id: 'f2' }],
          suggestions: [{ id: 'f3' }],
          nits: [],
        },
        submission: { reviewId: 'rev-1', decisions: [], postToGitHub: false },
      })
    ).toEqual({ summary: 'Token leak in callback', findingCount: 3 })
  })

  it('counts PRReview buckets when findings is absent', () => {
    expect(
      reviewHistoryFields({
        summary: 'Looks good',
        blockingIssues: [{ id: 'b1' }],
        suggestions: [],
        nits: [{ id: 'n1' }, { id: 'n2' }],
      })
    ).toEqual({ summary: 'Looks good', findingCount: 3 })
  })

  it('returns empty summary and 0 findings for null or junk', () => {
    expect(reviewHistoryFields(null)).toEqual({
      summary: '',
      findingCount: 0,
    })
    expect(reviewHistoryFields(undefined)).toEqual({
      summary: '',
      findingCount: 0,
    })
    expect(reviewHistoryFields('not-an-object')).toEqual({
      summary: '',
      findingCount: 0,
    })
    expect(reviewHistoryFields({ summary: 12, findings: 'nope' })).toEqual({
      summary: '',
      findingCount: 0,
    })
  })

  it('prefers findings[] over buckets when both exist', () => {
    expect(
      reviewHistoryFields({
        summary: 'mixed',
        findings: [{ id: 'a' }],
        blockingIssues: [{ id: 'b' }, { id: 'c' }],
      })
    ).toEqual({ summary: 'mixed', findingCount: 1 })
  })
})
