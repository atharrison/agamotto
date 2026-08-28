/**
 * GET /api/review/[id] — ATH-30 durable replay from the reviews table.
 *
 * Completing a review and leaving /review/[id] used to lose the output: the
 * SSE route required ?prUrl= before it even looked at the DB. View Review
 * links from the queue omit that query param, so COMPLETE rows must replay
 * from stored result + pr_url.
 */

import { NextRequest } from 'next/server'

const mockGetReview = jest.fn()
const mockCreateReview = jest.fn()
const mockCompleteReview = jest.fn()
const mockFailReview = jest.fn()
const mockRunReview = jest.fn()
const mockCreateReviewContext = jest.fn()
const mockGetGitHubToken = jest.fn()

jest.mock('../src/memory/review-store', () => ({
  getReview: (...args: unknown[]) => mockGetReview(...args),
  createReview: (...args: unknown[]) => mockCreateReview(...args),
  completeReview: (...args: unknown[]) => mockCompleteReview(...args),
  failReview: (...args: unknown[]) => mockFailReview(...args),
}))

jest.mock('../src/agents/pr-review/coordinator', () => ({
  runReview: (...args: unknown[]) => mockRunReview(...args),
}))

jest.mock('../src/harness/context', () => ({
  createReviewContext: (...args: unknown[]) => mockCreateReviewContext(...args),
}))

jest.mock('../src/lib/supabase/server', () => ({
  getGitHubToken: (...args: unknown[]) => mockGetGitHubToken(...args),
}))

const REVIEW_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const PR_URL = 'https://github.com/acme/app/pull/42'

const COMPLETE_RESULT = {
  blockingIssues: [
    {
      id: 'f-1',
      severity: 'BLOCKING',
      title: 'missing auth check',
    },
  ],
  suggestions: [],
  nits: [],
}

function completeRow() {
  return {
    id: REVIEW_ID,
    pr_url: PR_URL,
    status: 'COMPLETE',
    result: COMPLETE_RESULT,
  }
}

async function getReviewStream(query: string) {
  const { GET } = await import('../app/api/review/[id]/route')
  const req = new NextRequest(
    `http://localhost/api/review/${REVIEW_ID}${query}`
  )
  const res = await GET(req, { params: Promise.resolve({ id: REVIEW_ID }) })
  const text = await res.text()
  return { res, text }
}

function eventsOfType(text: string, type: string): unknown[] {
  const blocks = text.split('\n\n').filter(Boolean)
  const out: unknown[] = []
  for (const block of blocks) {
    const eventMatch = block.match(/^event: (.+)$/m)
    const dataMatch = block.match(/^data: (.+)$/m)
    if (eventMatch?.[1] === type && dataMatch?.[1]) {
      out.push(JSON.parse(dataMatch[1]))
    }
  }
  return out
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetReview.mockResolvedValue(null)
  mockCreateReview.mockResolvedValue(undefined)
  mockCompleteReview.mockResolvedValue(undefined)
  mockFailReview.mockResolvedValue(undefined)
  mockRunReview.mockResolvedValue(COMPLETE_RESULT)
  mockCreateReviewContext.mockReturnValue({})
  mockGetGitHubToken.mockResolvedValue(null)
})

describe('GET /api/review/[id] — ATH-30 stored replay', () => {
  it('replays a COMPLETE review from the DB when prUrl is omitted', async () => {
    mockGetReview.mockResolvedValue(completeRow())

    const { res, text } = await getReviewStream('')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(mockRunReview).not.toHaveBeenCalled()
    expect(mockCreateReview).not.toHaveBeenCalled()

    const connected = eventsOfType(text, 'connected')
    expect(
      connected.some(e => (e as { cached?: boolean }).cached === true)
    ).toBe(true)
    expect(eventsOfType(text, 'finding')).toEqual([
      { finding: COMPLETE_RESULT.blockingIssues[0] },
    ])
    expect(eventsOfType(text, 'done')).toEqual([{ reviewId: REVIEW_ID }])
  })

  it('errors when prUrl is omitted and no COMPLETE row exists', async () => {
    mockGetReview.mockResolvedValue(null)

    const { text } = await getReviewStream('')

    expect(mockRunReview).not.toHaveBeenCalled()
    expect(eventsOfType(text, 'error')).toEqual([
      { error: 'prUrl query param is required' },
    ])
    expect(eventsOfType(text, 'done')).toEqual([{ reviewId: REVIEW_ID }])
  })

  it('does not re-run the pipeline for a stored ERROR review', async () => {
    mockGetReview.mockResolvedValue({
      id: REVIEW_ID,
      pr_url: PR_URL,
      status: 'ERROR',
      result: null,
    })

    const { text } = await getReviewStream('')

    expect(mockRunReview).not.toHaveBeenCalled()
    expect(eventsOfType(text, 'error')).toEqual([
      { error: 'Review failed. Check server logs for details.' },
    ])
  })
})

describe('GET /api/review/[id] — live pipeline', () => {
  it('creates a row and runs the pipeline when nothing is stored', async () => {
    mockGetReview.mockResolvedValue(null)

    const { text } = await getReviewStream(
      `?prUrl=${encodeURIComponent(PR_URL)}`
    )

    expect(mockCreateReview).toHaveBeenCalledWith(REVIEW_ID, PR_URL, 'full')
    expect(mockRunReview).toHaveBeenCalledWith(
      expect.objectContaining({ reviewId: REVIEW_ID, prUrl: PR_URL })
    )
    expect(mockCompleteReview).toHaveBeenCalledWith(REVIEW_ID, COMPLETE_RESULT)
    expect(eventsOfType(text, 'error')).toEqual([])
  })

  it('skips createReview when a RUNNING row already exists', async () => {
    mockGetReview.mockResolvedValue({
      id: REVIEW_ID,
      pr_url: PR_URL,
      status: 'RUNNING',
      result: null,
    })

    await getReviewStream(`?prUrl=${encodeURIComponent(PR_URL)}`)

    expect(mockCreateReview).not.toHaveBeenCalled()
    expect(mockRunReview).toHaveBeenCalled()
  })

  it('emits an init error when createReview fails', async () => {
    mockGetReview.mockResolvedValue(null)
    mockCreateReview.mockRejectedValue(new Error('insert failed'))

    const { text } = await getReviewStream(
      `?prUrl=${encodeURIComponent(PR_URL)}`
    )

    expect(mockRunReview).not.toHaveBeenCalled()
    expect(eventsOfType(text, 'error')).toEqual([
      {
        error:
          'Failed to initialize review — database write error. Check server logs for details.',
      },
    ])
  })

  it('marks the review failed when runReview throws', async () => {
    mockGetReview.mockResolvedValue(null)
    mockRunReview.mockRejectedValue(new Error('pipeline exploded'))

    const { text } = await getReviewStream(
      `?prUrl=${encodeURIComponent(PR_URL)}`
    )

    expect(mockFailReview).toHaveBeenCalledWith(
      REVIEW_ID,
      'Error: pipeline exploded'
    )
    expect(eventsOfType(text, 'error')).toEqual([
      { error: 'Review pipeline failed. Check server logs for details.' },
    ])
  })

  it('treats a getReview throw as no stored row', async () => {
    mockGetReview.mockRejectedValue(new Error('db down'))

    const { text } = await getReviewStream('')

    expect(mockRunReview).not.toHaveBeenCalled()
    expect(eventsOfType(text, 'error')).toEqual([
      { error: 'prUrl query param is required' },
    ])
  })
})
