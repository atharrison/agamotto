// @octokit/rest is resolved to __mocks__/@octokit/rest.js via jest.config.js moduleNameMapper.
// Tests inject their own mock Octokit object via the factory argument.
import { createGithubTools, fetchPrConversation } from '../src/tools/github'
import type { Octokit } from '@octokit/rest'
import {
  AGAMOTTO_REVIEW_FOOTER,
  GithubCommentKind,
  GithubCommentSource,
} from '../src/lib/github-conversation'
import type { ParsedPrUrl } from '../src/lib/queue'

function mockOctokit(overrides: Partial<Octokit> = {}): Octokit {
  return {
    pulls: {
      get: jest.fn(),
      listReviewComments: jest.fn(),
      listFiles: jest.fn(),
      listReviews: jest.fn(),
    },
    issues: {
      createComment: jest.fn(),
      listComments: jest.fn(),
    },
    ...overrides,
  } as unknown as Octokit
}

describe('createGithubTools', () => {
  it('registers the expected 4 tools', () => {
    const tools = createGithubTools(mockOctokit())
    expect(Object.keys(tools).sort()).toEqual([
      'fetch_pr_comments',
      'fetch_pr_diff',
      'fetch_pr_files',
      'post_review_comment',
    ])
  })

  describe('fetch_pr_files', () => {
    it('returns mapped file list with patch within limit returned as-is', async () => {
      const octokit = mockOctokit()
      const bigPatch = 'x'.repeat(10_000)
      ;(octokit.pulls.listFiles as jest.Mock).mockResolvedValue({
        data: [
          {
            filename: 'src/main.py',
            status: 'modified',
            additions: 10,
            deletions: 2,
            patch: bigPatch,
            blob_url: 'https://github.com/blob/abc',
          },
        ],
      })

      const tools = createGithubTools(octokit)
      const result = await tools.fetch_pr_files.fn({
        owner: 'org',
        repo: 'repo',
        pull_number: 1,
      })

      const files = result as Array<{ filename: string; patch?: string }>
      expect(files).toHaveLength(1)
      expect(files[0].filename).toBe('src/main.py')
      expect(files[0].patch).toBe(bigPatch) // 10 KB is under the 32 KB limit — no truncation
    })
  })

  describe('post_review_comment', () => {
    const original = process.env.DRY_RUN

    afterEach(() => {
      process.env.DRY_RUN = original
    })

    it('returns dry-run response and skips API when DRY_RUN=true', async () => {
      process.env.DRY_RUN = 'true'
      const octokit = mockOctokit()
      const tools = createGithubTools(octokit)
      const result = await tools.post_review_comment.fn({
        owner: 'org',
        repo: 'repo',
        pull_number: 1,
        body: 'test comment',
      })
      expect((result as { dryRun: boolean }).dryRun).toBe(true)
      expect(octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('calls the API when DRY_RUN is not set', async () => {
      delete process.env.DRY_RUN
      const octokit = mockOctokit()
      ;(octokit.issues.createComment as jest.Mock).mockResolvedValue({
        data: { id: 1, html_url: 'https://github.com' },
      })
      const tools = createGithubTools(octokit)
      await tools.post_review_comment.fn({
        owner: 'org',
        repo: 'repo',
        pull_number: 1,
        body: 'test comment',
      })
      expect(octokit.issues.createComment).toHaveBeenCalledTimes(1)
    })
  })

  describe('fetch_pr_files — patch truncation', () => {
    it('returns patch unchanged when it is within the 32 KB limit', async () => {
      const shortPatch = 'a'.repeat(100)
      const octokit = mockOctokit()
      ;(octokit.pulls.listFiles as jest.Mock).mockResolvedValue({
        data: [
          {
            filename: 'src/foo.ts',
            status: 'modified',
            additions: 1,
            deletions: 0,
            patch: shortPatch,
            blob_url: '',
          },
        ],
      })
      const tools = createGithubTools(octokit)
      const result = (await tools.fetch_pr_files.fn({
        owner: 'org',
        repo: 'repo',
        pull_number: 1,
      })) as Array<{ patch?: string }>
      expect(result[0].patch).toBe(shortPatch)
    })

    it('slices patch and appends sentinel when patch exceeds 32 KB', async () => {
      const longPatch = 'b'.repeat(33 * 1024) // 33 KB — just over the limit
      const octokit = mockOctokit()
      ;(octokit.pulls.listFiles as jest.Mock).mockResolvedValue({
        data: [
          {
            filename: 'tests/big.test.ts',
            status: 'added',
            additions: 900,
            deletions: 0,
            patch: longPatch,
            blob_url: '',
          },
        ],
      })
      const tools = createGithubTools(octokit)
      const result = (await tools.fetch_pr_files.fn({
        owner: 'org',
        repo: 'repo',
        pull_number: 1,
      })) as Array<{ patch?: string }>
      expect(result[0].patch).toContain('[patch truncated')
      expect(result[0].patch).toContain('bytes omitted]')
      expect(result[0].patch!.length).toBeLessThan(longPatch.length)
    })

    it('returns undefined patch when GitHub provides no patch', async () => {
      const octokit = mockOctokit()
      ;(octokit.pulls.listFiles as jest.Mock).mockResolvedValue({
        data: [
          {
            filename: 'binary.png',
            status: 'added',
            additions: 0,
            deletions: 0,
            patch: undefined,
            blob_url: '',
          },
        ],
      })
      const tools = createGithubTools(octokit)
      const result = (await tools.fetch_pr_files.fn({
        owner: 'org',
        repo: 'repo',
        pull_number: 1,
      })) as Array<{ patch?: string }>
      expect(result[0].patch).toBeUndefined()
    })
  })

  describe('fetch_pr_comments', () => {
    it('maps comments to the expected shape', async () => {
      const octokit = mockOctokit()
      ;(octokit.pulls.listReviewComments as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 42,
            path: 'src/foo.ts',
            line: 10,
            body: 'Nice work',
            user: { login: 'alice' },
            created_at: '2026-06-13T00:00:00Z',
          },
        ],
      })
      const tools = createGithubTools(octokit)
      const result = await tools.fetch_pr_comments.fn({
        owner: 'org',
        repo: 'repo',
        pull_number: 1,
      })
      const comments = result as Array<{ id: number; author?: string }>
      expect(comments[0].id).toBe(42)
      expect(comments[0].author).toBe('alice')
    })
  })
})

const PARSED: ParsedPrUrl = {
  owner: 'org',
  repo: 'repo',
  pr_number: 1,
  canonical_url: 'https://github.com/org/repo/pull/1',
}

function emptyConversationOctokit(): Octokit {
  const octokit = mockOctokit()
  ;(octokit.pulls.listReviewComments as jest.Mock).mockResolvedValue({
    data: [],
  })
  ;(octokit.issues.listComments as jest.Mock).mockResolvedValue({ data: [] })
  ;(octokit.pulls.listReviews as jest.Mock).mockResolvedValue({ data: [] })
  return octokit
}

describe('fetchPrConversation', () => {
  it('returns empty items when octokit is null', async () => {
    const result = await fetchPrConversation(null, PARSED)
    expect(result).toEqual({ items: [] })
  })

  it('maps inline path/line/author/body as INLINE', async () => {
    const octokit = emptyConversationOctokit()
    ;(octokit.pulls.listReviewComments as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 42,
          path: 'src/foo.ts',
          line: 10,
          body: 'Nice work',
          user: { login: 'alice', type: 'User' },
          created_at: '2026-06-13T00:00:00Z',
        },
      ],
    })
    const { items } = await fetchPrConversation(octokit, PARSED)
    expect(items).toEqual([
      {
        kind: GithubCommentKind.INLINE,
        source: GithubCommentSource.HUMAN,
        id: 42,
        path: 'src/foo.ts',
        line: 10,
        body: 'Nice work',
        author: 'alice',
        createdAt: '2026-06-13T00:00:00Z',
      },
    ])
  })

  it('maps issue comments without path/line as DISCUSSION', async () => {
    const octokit = emptyConversationOctokit()
    ;(octokit.issues.listComments as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 7,
          body: 'Please keep the public API stable',
          user: { login: 'bob', type: 'User' },
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
    })
    const { items } = await fetchPrConversation(octokit, PARSED)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: GithubCommentKind.DISCUSSION,
      source: GithubCommentSource.HUMAN,
      id: 7,
      body: 'Please keep the public API stable',
      author: 'bob',
    })
    expect(items[0].path).toBeUndefined()
    expect(items[0].line).toBeUndefined()
  })

  it('maps non-empty review bodies as REVIEW_BODY and skips empty ones', async () => {
    const octokit = emptyConversationOctokit()
    ;(octokit.pulls.listReviews as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 3,
          body: 'Please add tests for the null path.',
          user: { login: 'carol', type: 'User' },
          submitted_at: '2026-08-02T00:00:00Z',
        },
        {
          id: 4,
          body: '   ',
          user: { login: 'carol', type: 'User' },
          submitted_at: '2026-08-03T00:00:00Z',
        },
      ],
    })
    const { items } = await fetchPrConversation(octokit, PARSED)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: GithubCommentKind.REVIEW_BODY,
      source: GithubCommentSource.HUMAN,
      id: 3,
      body: 'Please add tests for the null path.',
      author: 'carol',
      createdAt: '2026-08-02T00:00:00Z',
    })
  })

  it('tags Bot users as BOT and Agamotto footer as AGAMOTTO', async () => {
    const octokit = emptyConversationOctokit()
    ;(octokit.issues.listComments as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          body: 'Bump lodash',
          user: { login: 'dependabot[bot]', type: 'Bot' },
          created_at: '2026-08-01T00:00:00Z',
        },
        {
          id: 2,
          body: `Looks good\n${AGAMOTTO_REVIEW_FOOTER}`,
          user: { login: 'atharrison', type: 'User' },
          created_at: '2026-08-02T00:00:00Z',
        },
      ],
    })
    const { items } = await fetchPrConversation(octokit, PARSED)
    expect(items.map(c => c.source)).toEqual([
      GithubCommentSource.BOT,
      GithubCommentSource.AGAMOTTO,
    ])
  })

  it('returns empty items and no throw when listComments rejects', async () => {
    const octokit = emptyConversationOctokit()
    ;(octokit.issues.listComments as jest.Mock).mockRejectedValue(
      new Error('API down')
    )
    await expect(fetchPrConversation(octokit, PARSED)).resolves.toEqual({
      items: [],
      error: 'API down',
    })
  })

  it('maps missing author, null body, and missing submitted_at', async () => {
    const octokit = emptyConversationOctokit()
    ;(octokit.pulls.listReviewComments as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          path: null,
          line: null,
          body: null,
          user: null,
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
    })
    ;(octokit.pulls.listReviews as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 9,
          body: 'Looks fine overall',
          user: null,
          submitted_at: null,
        },
      ],
    })
    const { items } = await fetchPrConversation(octokit, PARSED)
    const inline = items.find(c => c.kind === GithubCommentKind.INLINE)
    const review = items.find(c => c.kind === GithubCommentKind.REVIEW_BODY)
    expect(inline?.author).toBeUndefined()
    expect(inline?.body).toBe('')
    expect(inline?.path).toBeUndefined()
    expect(review?.author).toBeUndefined()
    expect(review?.createdAt).toBe(new Date(0).toISOString())
  })

  it('stringifies non-Error rejections', async () => {
    const octokit = emptyConversationOctokit()
    ;(octokit.pulls.listReviews as jest.Mock).mockRejectedValue('nope')
    await expect(fetchPrConversation(octokit, PARSED)).resolves.toEqual({
      items: [],
      error: 'nope',
    })
  })
})
