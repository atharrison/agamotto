/**
 * Tests for src/memory/review-store.ts
 * Mocks @supabase/supabase-js so no real DB is needed.
 */

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

// Set env vars before the module is imported
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

import { createClient } from '@supabase/supabase-js'
import {
  createReview,
  completeReview,
  failReview,
  getReview,
  listCompleteReviewIdsForPr,
  listCompleteReviewsForPr,
  listCompleteReviewsForHistory,
  setReviewSubmission,
} from '../src/memory/review-store'
import { HISTORY_REVIEW_LIMIT } from '../src/lib/history-prs'
import type { PRReview } from '../src/agents/pr-review/schema'

const mockCreateClient = createClient as jest.Mock

// Build a chainable Supabase query mock. `result` is what the final await resolves to.
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of [
    'from',
    'insert',
    'update',
    'select',
    'eq',
    'neq',
    'order',
    'limit',
  ]) {
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

describe('createReview', () => {
  it('scopes the Supabase client to the agamotto schema', async () => {
    mockCreateClient.mockReturnValue(makeChain({ data: null, error: null }))
    await createReview('rev-1', 'https://github.com/a/b/pull/1', 'full')
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-key',
      { db: { schema: 'agamotto' } }
    )
  })

  it('inserts a RUNNING review row', async () => {
    mockCreateClient.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(
      createReview('rev-1', 'https://github.com/a/b/pull/1', 'full')
    ).resolves.toBeUndefined()
  })

  it('throws when Supabase returns an error', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { message: 'insert failed' } })
    )
    await expect(
      createReview('rev-1', 'https://github.com/a/b/pull/1', 'full')
    ).rejects.toThrow('createReview failed')
  })
})

describe('completeReview', () => {
  const fakeReview = {
    summary: 'LGTM',
    blockingIssues: [],
  } as unknown as PRReview

  it('updates the row to COMPLETE', async () => {
    mockCreateClient.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(completeReview('rev-1', fakeReview)).resolves.toBeUndefined()
  })

  it('throws when Supabase returns an error', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { message: 'update failed' } })
    )
    await expect(completeReview('rev-1', fakeReview)).rejects.toThrow(
      'completeReview failed'
    )
  })
})

describe('failReview', () => {
  it('updates the row to ERROR', async () => {
    mockCreateClient.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(
      failReview('rev-1', 'something went wrong')
    ).resolves.toBeUndefined()
  })

  it('throws when Supabase returns an error', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { message: 'update failed' } })
    )
    await expect(failReview('rev-1', 'something went wrong')).rejects.toThrow(
      'failReview failed'
    )
  })
})

describe('getReview', () => {
  it('returns the review row on success', async () => {
    const fakeRow = {
      id: 'rev-1',
      status: 'COMPLETE',
      pr_url: 'https://github.com/a/b/pull/1',
    }
    mockCreateClient.mockReturnValue(makeChain({ data: fakeRow, error: null }))
    const result = await getReview('rev-1')
    expect(result).toEqual(fakeRow)
  })

  it('returns null for PGRST116 (row not found)', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } })
    )
    const result = await getReview('nonexistent')
    expect(result).toBeNull()
  })

  it('throws for other Supabase errors', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { code: '500', message: 'DB error' } })
    )
    await expect(getReview('rev-1')).rejects.toThrow('getReview failed')
  })
})

describe('listCompleteReviewIdsForPr', () => {
  it('returns ids oldest-first and filters COMPLETE', async () => {
    const chain = makeChain({
      data: [{ id: 'rev-old' }, { id: 'rev-new' }],
      error: null,
    })
    mockCreateClient.mockReturnValue(chain)
    const ids = await listCompleteReviewIdsForPr(
      'https://github.com/a/b/pull/1'
    )
    expect(ids).toEqual(['rev-old', 'rev-new'])
    expect(chain.eq).toHaveBeenCalledWith(
      'pr_url',
      'https://github.com/a/b/pull/1'
    )
    expect(chain.eq).toHaveBeenCalledWith('status', 'COMPLETE')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('returns [] when the query has no rows', async () => {
    mockCreateClient.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(
      listCompleteReviewIdsForPr('https://github.com/a/b/pull/1')
    ).resolves.toEqual([])
  })

  it('throws when Supabase returns an error', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { message: 'DB error' } })
    )
    await expect(
      listCompleteReviewIdsForPr('https://github.com/a/b/pull/1')
    ).rejects.toThrow('listCompleteReviewIdsForPr failed')
  })
})

describe('listCompleteReviewsForPr', () => {
  it('returns newest-first COMPLETE rows with result and submission', async () => {
    const chain = makeChain({
      data: [
        {
          id: 'rev-new',
          created_at: '2026-08-18T00:00:00Z',
          result: { summary: 'round 2' },
          submission: { decisions: [] },
        },
      ],
      error: null,
    })
    mockCreateClient.mockReturnValue(chain)
    const rows = await listCompleteReviewsForPr(
      'https://github.com/a/b/pull/1',
      { excludeId: 'rev-current', limit: 3 }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('rev-new')
    expect(chain.select).toHaveBeenCalledWith(
      'id, created_at, result, submission'
    )
    expect(chain.eq).toHaveBeenCalledWith(
      'pr_url',
      'https://github.com/a/b/pull/1'
    )
    expect(chain.eq).toHaveBeenCalledWith('status', 'COMPLETE')
    expect(chain.neq).toHaveBeenCalledWith('id', 'rev-current')
    expect(chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    })
    expect(chain.limit).toHaveBeenCalledWith(3)
  })

  it('omits neq when excludeId is not provided', async () => {
    const chain = makeChain({ data: [], error: null })
    mockCreateClient.mockReturnValue(chain)
    await listCompleteReviewsForPr('https://github.com/a/b/pull/1')
    expect(chain.neq).not.toHaveBeenCalled()
    expect(chain.limit).toHaveBeenCalledWith(3)
  })

  it('returns [] when the query has no rows', async () => {
    mockCreateClient.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(
      listCompleteReviewsForPr('https://github.com/a/b/pull/1')
    ).resolves.toEqual([])
  })

  it('throws when Supabase returns an error', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { message: 'DB error' } })
    )
    await expect(
      listCompleteReviewsForPr('https://github.com/a/b/pull/1')
    ).rejects.toThrow('listCompleteReviewsForPr failed')
  })
})

describe('setReviewSubmission', () => {
  it('updates the submission field', async () => {
    mockCreateClient.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(
      setReviewSubmission('rev-1', { decision: 'accept' })
    ).resolves.toBeUndefined()
  })

  it('throws when Supabase returns an error', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { message: 'update failed' } })
    )
    await expect(setReviewSubmission('rev-1', {})).rejects.toThrow(
      'setReviewSubmission failed'
    )
  })
})

describe('listCompleteReviewsForHistory', () => {
  it('returns COMPLETE rows newest-first capped at HISTORY_REVIEW_LIMIT', async () => {
    const chain = makeChain({
      data: [
        {
          id: 'rev-new',
          pr_url: 'https://github.com/a/b/pull/1',
          pr_metadata: {},
          result: { blockingIssues: [] },
          created_at: '2026-08-29T00:00:00Z',
        },
      ],
      error: null,
    })
    mockCreateClient.mockReturnValue(chain)
    const rows = await listCompleteReviewsForHistory()
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('rev-new')
    expect(chain.select).toHaveBeenCalledWith(
      'id, pr_url, pr_metadata, result, created_at'
    )
    expect(chain.eq).toHaveBeenCalledWith('status', 'COMPLETE')
    expect(chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    })
    expect(chain.limit).toHaveBeenCalledWith(HISTORY_REVIEW_LIMIT)
  })

  it('returns [] when the query has no rows', async () => {
    mockCreateClient.mockReturnValue(makeChain({ data: null, error: null }))
    await expect(listCompleteReviewsForHistory()).resolves.toEqual([])
  })

  it('throws when Supabase returns an error', async () => {
    mockCreateClient.mockReturnValue(
      makeChain({ data: null, error: { message: 'DB error' } })
    )
    await expect(listCompleteReviewsForHistory()).rejects.toThrow(
      'listCompleteReviewsForHistory failed'
    )
  })
})
