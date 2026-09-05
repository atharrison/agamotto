/**
 * Tests for src/memory/tracked-pr-store.ts
 */

const mockFrom = jest.fn()

jest.mock('../src/lib/supabase/server', () => ({
  createSupabaseServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
}))

import { parsePrUrl } from '../src/lib/queue'
import { TrackedPrStatus } from '../src/lib/tracked-prs'
import {
  markPrInReview,
  markPrReady,
  markPrReviewed,
  markPrReviewFailed,
  healStuckInReviewRows,
  listTrackedPrsByUrls,
} from '../src/memory/tracked-pr-store'

const parsed = parsePrUrl('https://github.com/acme/app/pull/7')!

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['upsert', 'update', 'eq', 'select', 'in', 'not']) {
    chain[m] = jest.fn().mockReturnValue(chain)
  }
  chain.single = jest.fn().mockResolvedValue(result)
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  return chain
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('markPrInReview', () => {
  it('upserts IN_REVIEW + last_review_id on the owner/repo/pr_number conflict', async () => {
    const chain = makeChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    await markPrInReview(parsed, 'rev-1')
    expect(mockFrom).toHaveBeenCalledWith('tracked_prs')
    expect(chain.upsert).toHaveBeenCalledWith(
      {
        owner: 'acme',
        repo: 'app',
        pr_number: 7,
        pr_url: 'https://github.com/acme/app/pull/7',
        status: TrackedPrStatus.IN_REVIEW,
        last_review_id: 'rev-1',
      },
      { onConflict: 'owner,repo,pr_number' }
    )
  })

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: null, error: { message: 'fk violation' } })
    )
    await expect(markPrInReview(parsed, 'rev-1')).rejects.toThrow(
      'markPrInReview failed: fk violation'
    )
  })

  it('omits last_review_id when reviewId is null', async () => {
    const chain = makeChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    await markPrInReview(parsed, null)
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ last_review_id: expect.anything() }),
      { onConflict: 'owner,repo,pr_number' }
    )
  })
})

describe('markPrReady', () => {
  it('updates READY + last_review_id only while the row is IN_REVIEW', async () => {
    const chain = makeChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    await markPrReady(parsed, 'rev-2')
    expect(chain.update).toHaveBeenCalledWith({
      status: TrackedPrStatus.READY,
      last_review_id: 'rev-2',
    })
    expect(chain.eq).toHaveBeenCalledWith('owner', 'acme')
    expect(chain.eq).toHaveBeenCalledWith('repo', 'app')
    expect(chain.eq).toHaveBeenCalledWith('pr_number', 7)
    expect(chain.eq).toHaveBeenCalledWith('status', TrackedPrStatus.IN_REVIEW)
    expect(chain.update.mock.calls[0][0]).not.toHaveProperty('review_count')
  })

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: null, error: { message: 'timeout' } })
    )
    await expect(markPrReady(parsed, 'rev-2')).rejects.toThrow(
      'markPrReady failed: timeout'
    )
  })
})

describe('markPrReviewed', () => {
  it('updates REVIEWED + last_review_id without incrementing review_count', async () => {
    const chain = makeChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    await markPrReviewed(parsed, 'rev-2')
    expect(chain.update).toHaveBeenCalledWith({
      status: TrackedPrStatus.REVIEWED,
      last_review_id: 'rev-2',
    })
    expect(chain.eq).toHaveBeenCalledWith('owner', 'acme')
    expect(chain.eq).toHaveBeenCalledWith('repo', 'app')
    expect(chain.eq).toHaveBeenCalledWith('pr_number', 7)
    expect(chain.update.mock.calls[0][0]).not.toHaveProperty('review_count')
  })

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: null, error: { message: 'timeout' } })
    )
    await expect(markPrReviewed(parsed, 'rev-2')).rejects.toThrow(
      'markPrReviewed failed: timeout'
    )
  })
})

describe('markPrReviewFailed', () => {
  it('sets OPEN when review_count is 0', async () => {
    const read = makeChain({
      data: { review_count: 0, status: TrackedPrStatus.IN_REVIEW },
      error: null,
    })
    const write = makeChain({ data: null, error: null })
    mockFrom.mockReturnValueOnce(read).mockReturnValueOnce(write)
    await markPrReviewFailed(parsed)
    expect(write.update).toHaveBeenCalledWith({
      status: TrackedPrStatus.OPEN,
    })
    expect(write.eq).toHaveBeenCalledWith('status', TrackedPrStatus.IN_REVIEW)
  })

  it('sets REVIEWED when review_count is already > 0', async () => {
    const read = makeChain({
      data: { review_count: 2, status: TrackedPrStatus.IN_REVIEW },
      error: null,
    })
    const write = makeChain({ data: null, error: null })
    mockFrom.mockReturnValueOnce(read).mockReturnValueOnce(write)
    await markPrReviewFailed(parsed)
    expect(write.update).toHaveBeenCalledWith({
      status: TrackedPrStatus.REVIEWED,
    })
  })

  it('treats a null review_count as zero', async () => {
    const read = makeChain({
      data: { review_count: null, status: TrackedPrStatus.IN_REVIEW },
      error: null,
    })
    const write = makeChain({ data: null, error: null })
    mockFrom.mockReturnValueOnce(read).mockReturnValueOnce(write)
    await markPrReviewFailed(parsed)
    expect(write.update).toHaveBeenCalledWith({
      status: TrackedPrStatus.OPEN,
    })
  })

  it('does not update when the row is not IN_REVIEW', async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        data: { review_count: 1, status: TrackedPrStatus.CLOSED },
        error: null,
      })
    )
    await markPrReviewFailed(parsed)
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('no-ops when the row is missing', async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        data: null,
        error: { message: 'not found', code: 'PGRST116' },
      })
    )
    await expect(markPrReviewFailed(parsed)).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('throws when the read fails', async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({ data: null, error: { message: 'timeout' } })
    )
    await expect(markPrReviewFailed(parsed)).rejects.toThrow(
      'markPrReviewFailed failed: timeout'
    )
  })

  it('throws when the read fails with a non-missing code', async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        data: null,
        error: { message: 'denied', code: '42501' },
      })
    )
    await expect(markPrReviewFailed(parsed)).rejects.toThrow(
      'markPrReviewFailed failed: denied'
    )
  })

  it('throws when the update fails', async () => {
    mockFrom
      .mockReturnValueOnce(
        makeChain({
          data: { review_count: 0, status: TrackedPrStatus.IN_REVIEW },
          error: null,
        })
      )
      .mockReturnValueOnce(
        makeChain({ data: null, error: { message: 'timeout' } })
      )
    await expect(markPrReviewFailed(parsed)).rejects.toThrow(
      'markPrReviewFailed failed: timeout'
    )
  })

  it('returns when the read succeeds with no row', async () => {
    mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null }))
    await expect(markPrReviewFailed(parsed)).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })
})

describe('healStuckInReviewRows', () => {
  it('returns without querying reviews when no IN_REVIEW rows have a last_review_id', async () => {
    const list = makeChain({ data: [], error: null })
    mockFrom.mockReturnValueOnce(list)
    await healStuckInReviewRows()
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('tracked_prs')
    expect(list.eq).toHaveBeenCalledWith('status', TrackedPrStatus.IN_REVIEW)
    expect(list.not).toHaveBeenCalledWith('last_review_id', 'is', null)
  })

  it('skips blank last_review_id values', async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({
        data: [
          {
            owner: 'acme',
            repo: 'app',
            pr_number: 7,
            last_review_id: '',
            review_count: 0,
          },
        ],
        error: null,
      })
    )
    await healStuckInReviewRows()
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('clears IN_REVIEW when last_review_id points at an ERROR review', async () => {
    const list = makeChain({
      data: [
        {
          owner: 'acme',
          repo: 'app',
          pr_number: 7,
          last_review_id: 'rev-err',
          review_count: 0,
        },
      ],
      error: null,
    })
    const reviews = makeChain({
      data: [{ id: 'rev-err', status: 'ERROR' }],
      error: null,
    })
    const read = makeChain({
      data: { review_count: 0, status: TrackedPrStatus.IN_REVIEW },
      error: null,
    })
    const write = makeChain({ data: null, error: null })
    mockFrom
      .mockReturnValueOnce(list)
      .mockReturnValueOnce(reviews)
      .mockReturnValueOnce(read)
      .mockReturnValueOnce(write)

    await healStuckInReviewRows()

    expect(mockFrom).toHaveBeenNthCalledWith(2, 'reviews')
    expect(reviews.in).toHaveBeenCalledWith('id', ['rev-err'])
    expect(reviews.in).toHaveBeenCalledWith('status', ['ERROR', 'COMPLETE'])
    expect(write.update).toHaveBeenCalledWith({
      status: TrackedPrStatus.OPEN,
    })
  })

  it('flips IN_REVIEW to READY when last_review_id points at a COMPLETE review', async () => {
    const list = makeChain({
      data: [
        {
          owner: 'acme',
          repo: 'app',
          pr_number: 7,
          last_review_id: 'rev-done',
          review_count: 0,
        },
      ],
      error: null,
    })
    const reviews = makeChain({
      data: [{ id: 'rev-done', status: 'COMPLETE' }],
      error: null,
    })
    const write = makeChain({ data: null, error: null })
    mockFrom
      .mockReturnValueOnce(list)
      .mockReturnValueOnce(reviews)
      .mockReturnValueOnce(write)

    await healStuckInReviewRows()

    expect(write.update).toHaveBeenCalledWith({
      status: TrackedPrStatus.READY,
      last_review_id: 'rev-done',
    })
    expect(write.eq).toHaveBeenCalledWith('status', TrackedPrStatus.IN_REVIEW)
  })

  it('does not update when last_review_id is still RUNNING', async () => {
    const list = makeChain({
      data: [
        {
          owner: 'acme',
          repo: 'app',
          pr_number: 7,
          last_review_id: 'rev-live',
          review_count: 0,
        },
      ],
      error: null,
    })
    const reviews = makeChain({ data: [], error: null })
    mockFrom.mockReturnValueOnce(list).mockReturnValueOnce(reviews)
    await healStuckInReviewRows()
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('treats a null failed-reviews result as none failed', async () => {
    mockFrom
      .mockReturnValueOnce(
        makeChain({
          data: [
            {
              owner: 'acme',
              repo: 'app',
              pr_number: 7,
              last_review_id: 'rev-1',
              review_count: 0,
            },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
    await healStuckInReviewRows()
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('throws when the IN_REVIEW list fails', async () => {
    mockFrom.mockReturnValueOnce(
      makeChain({ data: null, error: { message: 'timeout' } })
    )
    await expect(healStuckInReviewRows()).rejects.toThrow(
      'healStuckInReviewRows failed: timeout'
    )
  })

  it('throws when the reviews lookup fails', async () => {
    mockFrom
      .mockReturnValueOnce(
        makeChain({
          data: [
            {
              owner: 'acme',
              repo: 'app',
              pr_number: 7,
              last_review_id: 'rev-err',
              review_count: 0,
            },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(
        makeChain({ data: null, error: { message: 'denied' } })
      )
    await expect(healStuckInReviewRows()).rejects.toThrow(
      'healStuckInReviewRows failed: denied'
    )
  })
})

describe('listTrackedPrsByUrls', () => {
  it('returns [] without querying when urls is empty', async () => {
    await expect(listTrackedPrsByUrls([])).resolves.toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('selects title, author, and status for the given urls', async () => {
    const chain = makeChain({
      data: [
        {
          pr_url: 'https://github.com/acme/app/pull/7',
          pr_title: 'Fix',
          pr_author: 'alice',
          status: TrackedPrStatus.REVIEWED,
        },
      ],
      error: null,
    })
    mockFrom.mockReturnValue(chain)
    const rows = await listTrackedPrsByUrls([
      'https://github.com/acme/app/pull/7',
    ])
    expect(rows).toHaveLength(1)
    expect(mockFrom).toHaveBeenCalledWith('tracked_prs')
    expect(chain.select).toHaveBeenCalledWith(
      'pr_url, pr_title, pr_author, status, last_review_id'
    )
    expect(chain.in).toHaveBeenCalledWith('pr_url', [
      'https://github.com/acme/app/pull/7',
    ])
  })

  it('returns [] when the query has no rows', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(
      listTrackedPrsByUrls(['https://github.com/acme/app/pull/7'])
    ).resolves.toEqual([])
  })

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: null, error: { message: 'timeout' } })
    )
    await expect(
      listTrackedPrsByUrls(['https://github.com/acme/app/pull/7'])
    ).rejects.toThrow('listTrackedPrsByUrls failed: timeout')
  })
})
