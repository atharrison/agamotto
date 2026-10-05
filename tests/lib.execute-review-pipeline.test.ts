const mockRunReview = jest.fn()
const mockCreateReviewContext = jest.fn()
const mockCompleteReview = jest.fn()
const mockFailReview = jest.fn()
const mockMarkPrReady = jest.fn()
const mockMarkPrReviewFailed = jest.fn()
const mockLoadReviewSettings = jest.fn()

jest.mock('../src/agents/pr-review/coordinator', () => ({
  runReview: (...args: unknown[]) => mockRunReview(...args),
}))

jest.mock('../src/harness/context', () => ({
  createReviewContext: (...args: unknown[]) => mockCreateReviewContext(...args),
}))

jest.mock('../src/memory/review-store', () => ({
  completeReview: (...args: unknown[]) => mockCompleteReview(...args),
  failReview: (...args: unknown[]) => mockFailReview(...args),
}))

jest.mock('../src/memory/tracked-pr-store', () => ({
  markPrReady: (...args: unknown[]) => mockMarkPrReady(...args),
  markPrReviewFailed: (...args: unknown[]) => mockMarkPrReviewFailed(...args),
}))

jest.mock('../src/lib/conventions-store', () => ({
  loadReviewSettings: (...args: unknown[]) => mockLoadReviewSettings(...args),
}))

import {
  executeReviewPipeline,
  waitForInflightPipeline,
} from '../src/lib/execute-review-pipeline'
import {
  PR_FETCH_MESSAGES,
  PrFetchError,
  PrFetchFailure,
} from '../src/lib/pr-fetch-error'

const REVIEW_ID = 'rev-inflight'
const PR_URL = 'https://github.com/acme/app/pull/7'

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateReviewContext.mockReturnValue({})
  mockLoadReviewSettings.mockResolvedValue({
    conventionsDoc: undefined,
    overlays: {},
  })
  mockCompleteReview.mockResolvedValue(undefined)
  mockFailReview.mockResolvedValue(undefined)
  mockMarkPrReady.mockResolvedValue(undefined)
  mockMarkPrReviewFailed.mockResolvedValue(undefined)
  mockRunReview.mockResolvedValue({
    blockingIssues: [],
    suggestions: [],
    nits: [],
  })
})

describe('executeReviewPipeline', () => {
  it('reuses the in-flight promise for the same reviewId', async () => {
    let release: () => void = () => {}
    mockRunReview.mockReturnValue(
      new Promise(resolve => {
        release = () =>
          resolve({ blockingIssues: [], suggestions: [], nits: [] })
      })
    )

    const first = executeReviewPipeline({
      reviewId: REVIEW_ID,
      prUrl: PR_URL,
      mode: 'full',
      githubToken: 'ghu_a',
      emit: () => {},
    })
    const second = executeReviewPipeline({
      reviewId: REVIEW_ID,
      prUrl: PR_URL,
      mode: 'full',
      githubToken: 'ghu_b',
      emit: () => {},
    })

    expect(second).toBe(first)
    expect(waitForInflightPipeline(REVIEW_ID)).toBe(first)

    for (let i = 0; i < 20 && mockRunReview.mock.calls.length === 0; i++) {
      await Promise.resolve()
    }
    expect(mockRunReview).toHaveBeenCalledTimes(1)

    release()
    await first
    expect(waitForInflightPipeline(REVIEW_ID)).toBeUndefined()
  })

  it('logs when markPrReady fails after COMPLETE', async () => {
    mockMarkPrReady.mockRejectedValue(new Error('ready failed'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await executeReviewPipeline({
      reviewId: 'rev-ready',
      prUrl: PR_URL,
      mode: 'full',
      githubToken: 'ghu_a',
      emit: () => {},
    })
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/markPrReady failed/),
      expect.any(Error)
    )
    spy.mockRestore()
  })

  it('skips queue failure updates when the PR URL does not parse', async () => {
    mockRunReview.mockRejectedValue(new Error('boom'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const emit = jest.fn()
    await executeReviewPipeline({
      reviewId: 'rev-bad-url',
      prUrl: 'https://example.com/not-a-pr',
      mode: 'full',
      githubToken: 'ghu_a',
      emit,
    })
    expect(mockMarkPrReviewFailed).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith('error', expect.any(Object))
    spy.mockRestore()
  })

  it('swallows failReview errors after a pipeline throw', async () => {
    mockRunReview.mockRejectedValue(new Error('boom'))
    mockFailReview.mockRejectedValue(new Error('fail write'))
    mockMarkPrReviewFailed.mockRejectedValue(new Error('queue write'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const emit = jest.fn()
    await executeReviewPipeline({
      reviewId: 'rev-fail',
      prUrl: PR_URL,
      mode: 'full',
      githubToken: 'ghu_a',
      emit,
    })
    expect(emit).toHaveBeenCalledWith('error', {
      error: 'Review pipeline failed. Check server logs for details.',
    })
    spy.mockRestore()
  })

  it('fails the review, frees the PR, and emits the sign-in copy on a PrFetchError (ATH-61)', async () => {
    mockRunReview.mockRejectedValue(new PrFetchError(PrFetchFailure.AUTH))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const emit = jest.fn()
    await executeReviewPipeline({
      reviewId: 'rev-pr-fetch',
      prUrl: PR_URL,
      mode: 'full',
      githubToken: null,
      emit,
    })
    expect(mockCompleteReview).not.toHaveBeenCalled()
    expect(mockFailReview).toHaveBeenCalledWith(
      'rev-pr-fetch',
      expect.stringContaining(PR_FETCH_MESSAGES[PrFetchFailure.AUTH])
    )
    expect(mockMarkPrReviewFailed).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'app', pr_number: 7 })
    )
    expect(emit).toHaveBeenCalledWith('error', {
      error: PR_FETCH_MESSAGES[PrFetchFailure.AUTH],
      failure: PrFetchFailure.AUTH,
    })
    expect(emit).toHaveBeenCalledWith('done', { reviewId: 'rev-pr-fetch' })
    spy.mockRestore()
  })

  it('fails with the sign-in copy when the user session is dead, without running agents', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const emit = jest.fn()
    await executeReviewPipeline({
      reviewId: 'rev-session',
      prUrl: PR_URL,
      mode: 'full',
      githubToken: null,
      sessionExpired: true,
      emit,
    })
    // Must not build a context: that is where GITHUB_TOKEN would be picked up.
    expect(mockCreateReviewContext).not.toHaveBeenCalled()
    expect(mockRunReview).not.toHaveBeenCalled()
    expect(mockFailReview).toHaveBeenCalledWith(
      'rev-session',
      expect.stringContaining('PrFetchError[AUTH]')
    )
    expect(mockMarkPrReviewFailed).toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith('error', {
      error: PR_FETCH_MESSAGES[PrFetchFailure.AUTH],
      failure: PrFetchFailure.AUTH,
    })
    spy.mockRestore()
  })

  it('runs normally with a null token when the session is not flagged expired (webhook auto-start)', async () => {
    await executeReviewPipeline({
      reviewId: 'rev-webhook',
      prUrl: PR_URL,
      mode: 'full',
      githubToken: 'ghp_env_pat',
      emit: () => {},
    })
    expect(mockCreateReviewContext).toHaveBeenCalledWith(
      undefined,
      'ghp_env_pat'
    )
    expect(mockRunReview).toHaveBeenCalledTimes(1)
  })
})
