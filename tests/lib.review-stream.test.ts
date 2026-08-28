import { ReviewStreamKind, resolveReviewStream } from '../src/lib/review-stream'

const PR_URL = 'https://github.com/acme/app/pull/42'
const RESULT = { summary: 'looks good' }

describe('resolveReviewStream', () => {
  it('replays a COMPLETE stored review even when the query has no prUrl', () => {
    expect(
      resolveReviewStream({
        queryPrUrl: '',
        stored: {
          status: 'COMPLETE',
          pr_url: PR_URL,
          result: RESULT,
        },
      })
    ).toEqual({
      kind: ReviewStreamKind.REPLAY,
      prUrl: PR_URL,
    })
  })

  it('replays a COMPLETE stored review when the query also has a prUrl', () => {
    expect(
      resolveReviewStream({
        queryPrUrl: PR_URL,
        stored: {
          status: 'COMPLETE',
          pr_url: PR_URL,
          result: RESULT,
        },
      })
    ).toEqual({
      kind: ReviewStreamKind.REPLAY,
      prUrl: PR_URL,
    })
  })

  it('does not replay a COMPLETE row with a null result', () => {
    expect(
      resolveReviewStream({
        queryPrUrl: PR_URL,
        stored: {
          status: 'COMPLETE',
          pr_url: PR_URL,
          result: null,
        },
      })
    ).toEqual({
      kind: ReviewStreamKind.RUN,
      prUrl: PR_URL,
    })
  })

  it('returns ERROR for a stored ERROR review without re-running', () => {
    expect(
      resolveReviewStream({
        queryPrUrl: PR_URL,
        stored: {
          status: 'ERROR',
          pr_url: PR_URL,
          result: null,
        },
      })
    ).toEqual({
      kind: ReviewStreamKind.ERROR,
      error: 'Review failed. Check server logs for details.',
    })
  })

  it('returns ERROR when there is no prUrl and nothing stored', () => {
    expect(
      resolveReviewStream({
        queryPrUrl: '',
        stored: null,
      })
    ).toEqual({
      kind: ReviewStreamKind.ERROR,
      error: 'prUrl query param is required',
    })
  })

  it('runs using the stored pr_url when the query is empty and the row is still RUNNING', () => {
    expect(
      resolveReviewStream({
        queryPrUrl: '',
        stored: {
          status: 'RUNNING',
          pr_url: PR_URL,
          result: null,
        },
      })
    ).toEqual({
      kind: ReviewStreamKind.RUN,
      prUrl: PR_URL,
    })
  })

  it('runs a fresh pipeline when prUrl is present and nothing is stored', () => {
    expect(
      resolveReviewStream({
        queryPrUrl: PR_URL,
        stored: null,
      })
    ).toEqual({
      kind: ReviewStreamKind.RUN,
      prUrl: PR_URL,
    })
  })

  it('runs a fresh pipeline when prUrl is present and the stored row is RUNNING', () => {
    expect(
      resolveReviewStream({
        queryPrUrl: PR_URL,
        stored: {
          status: 'RUNNING',
          pr_url: PR_URL,
          result: null,
        },
      })
    ).toEqual({
      kind: ReviewStreamKind.RUN,
      prUrl: PR_URL,
    })
  })
})
