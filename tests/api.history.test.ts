/**
 * Unit tests for GET /api/history.
 */

import { NextRequest } from 'next/server'

interface MockSupabaseClient {
  auth: { getUser: jest.Mock }
}

function makeAnon(user: unknown): MockSupabaseClient {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  }
}

const mockAnonClient: { current: MockSupabaseClient | null } = { current: null }

jest.mock('../src/lib/supabase/server', () => ({
  createSupabaseServerClient: jest
    .fn()
    .mockImplementation(() => mockAnonClient.current),
  createSupabaseServiceRoleClient: jest.fn(),
  getGitHubToken: jest.fn().mockResolvedValue(null),
  GH_TOKEN_COOKIE: 'gh_provider_token',
}))

const mockListReviews = jest.fn()
const mockListTracked = jest.fn()

jest.mock('../src/memory/review-store', () => ({
  listCompleteReviewsForHistory: (...args: unknown[]) =>
    mockListReviews(...args),
}))

jest.mock('../src/memory/tracked-pr-store', () => ({
  listTrackedPrsByUrls: (...args: unknown[]) => mockListTracked(...args),
}))

const MOCK_USER = { id: 'user-1', email: 'dev@example.com' }

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' })
}

describe('GET /api/history', () => {
  beforeEach(() => {
    jest.resetModules()
    mockListReviews.mockReset()
    mockListTracked.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockAnonClient.current = makeAnon(null)
    const { GET } = await import('../app/api/history/route')
    const res = await GET(makeRequest('http://localhost/api/history'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns grouped PRs, counts only, newest last-review first', async () => {
    mockAnonClient.current = makeAnon(MOCK_USER)
    mockListReviews.mockResolvedValue([
      {
        id: 'rev-new',
        pr_url: 'https://github.com/acme/api/pull/1',
        pr_metadata: {},
        result: {
          blockingIssues: [{}, {}],
          suggestions: [{}],
          nits: [],
        },
        created_at: '2026-08-29T00:00:00Z',
      },
      {
        id: 'rev-old',
        pr_url: 'https://github.com/acme/api/pull/1',
        pr_metadata: {},
        result: { blockingIssues: [], suggestions: [], nits: [{}] },
        created_at: '2026-08-20T00:00:00Z',
      },
    ])
    mockListTracked.mockResolvedValue([
      {
        pr_url: 'https://github.com/acme/api/pull/1',
        pr_title: 'Fix webhook',
        pr_author: 'alice',
        status: 'REVIEWED',
      },
    ])

    const { GET } = await import('../app/api/history/route')
    const res = await GET(makeRequest('http://localhost/api/history'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.repos).toEqual(['acme/api'])
    expect(body.prs).toHaveLength(1)
    expect(body.prs[0].title).toBe('Fix webhook')
    expect(body.prs[0].reviews.map((r: { id: string }) => r.id)).toEqual([
      'rev-old',
      'rev-new',
    ])
    expect(body.prs[0].reviews[1].counts).toEqual({
      blocking: 2,
      suggestions: 1,
      nits: 0,
    })
    expect(JSON.stringify(body)).not.toContain('blockingIssues')
    expect(mockListTracked).toHaveBeenCalledWith([
      'https://github.com/acme/api/pull/1',
    ])
  })

  it('returns empty prs when there are no COMPLETE reviews', async () => {
    mockAnonClient.current = makeAnon(MOCK_USER)
    mockListReviews.mockResolvedValue([])
    mockListTracked.mockResolvedValue([])
    const { GET } = await import('../app/api/history/route')
    const res = await GET(makeRequest('http://localhost/api/history'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ prs: [], repos: [] })
    expect(mockListTracked).toHaveBeenCalledWith([])
  })

  it('returns 500 when the reviews query fails', async () => {
    mockAnonClient.current = makeAnon(MOCK_USER)
    mockListReviews.mockRejectedValue(new Error('DB down'))
    const { GET } = await import('../app/api/history/route')
    const res = await GET(makeRequest('http://localhost/api/history'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})
