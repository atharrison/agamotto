import { TrackedPrStatus } from '../src/lib/tracked-prs'
import {
  HISTORY_PR_PAGE_SIZE,
  filterHistoryPrsByRepos,
  groupReviewsIntoHistoryPrs,
  reviewChipsForPrUrl,
  reviewChipsRecord,
  historyRepoKeys,
  paginateHistoryPrs,
  buildHistoryPayload,
  mergeHistoryCatalog,
  filterHistoryCatalog,
  canStartHistoryReview,
  latestHistoryReviewHref,
  type HistoryReviewSource,
  type TrackedPrHistoryMeta,
} from '../src/lib/history-prs'
import { GithubPrState } from '../src/lib/github-pull'

function row(
  partial: Partial<HistoryReviewSource> &
    Pick<HistoryReviewSource, 'id' | 'pr_url' | 'created_at'>
): HistoryReviewSource {
  return {
    pr_metadata: {},
    result: { blockingIssues: [], suggestions: [], nits: [] },
    ...partial,
  }
}

describe('groupReviewsIntoHistoryPrs', () => {
  it('groups reviews by PR, oldest chip first, newest PR first', () => {
    const prs = groupReviewsIntoHistoryPrs([
      row({
        id: 'rev-b-new',
        pr_url: 'https://github.com/acme/b/pull/2',
        created_at: '2026-08-29T12:00:00Z',
        result: { blockingIssues: [{}], suggestions: [], nits: [] },
      }),
      row({
        id: 'rev-a-new',
        pr_url: 'https://github.com/acme/a/pull/1',
        created_at: '2026-08-28T12:00:00Z',
        result: {
          blockingIssues: [{}, {}],
          suggestions: [{}],
          nits: [{}],
        },
      }),
      row({
        id: 'rev-a-old',
        pr_url: 'https://github.com/acme/a/pull/1',
        created_at: '2026-08-20T12:00:00Z',
        result: { blockingIssues: [], suggestions: [{}], nits: [] },
      }),
    ])

    expect(prs.map(p => p.prUrl)).toEqual([
      'https://github.com/acme/b/pull/2',
      'https://github.com/acme/a/pull/1',
    ])
    expect(prs[1].reviews.map(r => r.id)).toEqual(['rev-a-old', 'rev-a-new'])
    expect(prs[1].reviews.map(r => r.round)).toEqual([1, 2])
    expect(prs[1].reviews[1].counts).toEqual({
      blocking: 2,
      suggestions: 1,
      nits: 1,
    })
    expect(prs[1].lastReviewedAt).toBe('2026-08-28T12:00:00Z')
    expect(prs[0].owner).toBe('acme')
    expect(prs[0].repo).toBe('b')
    expect(prs[0].prNumber).toBe(2)
    expect(prs[0].repoKey).toBe('acme/b')
  })

  it('joins tracked_prs metadata when present and still includes untracked PRs', () => {
    const tracked = new Map<string, TrackedPrHistoryMeta>([
      [
        'https://github.com/acme/a/pull/1',
        {
          pr_title: 'Fix webhook',
          pr_author: 'alice',
          status: TrackedPrStatus.REVIEWED,
        },
      ],
    ])
    const prs = groupReviewsIntoHistoryPrs(
      [
        row({
          id: 'rev-1',
          pr_url: 'https://github.com/acme/a/pull/1',
          created_at: '2026-08-28T12:00:00Z',
        }),
        row({
          id: 'rev-2',
          pr_url: 'https://github.com/acme/gone/pull/9',
          created_at: '2026-08-27T12:00:00Z',
          pr_metadata: { title: 'From metadata', author: 'bob' },
        }),
      ],
      tracked
    )

    expect(prs[0].title).toBe('Fix webhook')
    expect(prs[0].author).toBe('alice')
    expect(prs[0].status).toBe(TrackedPrStatus.REVIEWED)
    expect(prs[1].title).toBe('From metadata')
    expect(prs[1].author).toBe('bob')
    expect(prs[1].status).toBeNull()
  })

  it('marks githubState CLOSED from tracked CLOSED', () => {
    const prs = groupReviewsIntoHistoryPrs(
      [
        row({
          id: 'rev-1',
          pr_url: 'https://github.com/acme/a/pull/1',
          created_at: '2026-08-28T12:00:00Z',
        }),
      ],
      new Map([
        [
          'https://github.com/acme/a/pull/1',
          {
            pr_title: 'Done',
            pr_author: 'alice',
            status: TrackedPrStatus.CLOSED,
          },
        ],
      ])
    )
    expect(prs[0].githubState).toBe(GithubPrState.CLOSED)
  })

  it('sets inProgressReviewId null when IN_REVIEW has no last_review_id', () => {
    const prs = groupReviewsIntoHistoryPrs(
      [
        row({
          id: 'rev-1',
          pr_url: 'https://github.com/acme/a/pull/1',
          created_at: '2026-08-28T12:00:00Z',
        }),
      ],
      new Map([
        [
          'https://github.com/acme/a/pull/1',
          {
            pr_title: 'Live',
            pr_author: 'alice',
            status: TrackedPrStatus.IN_REVIEW,
          },
        ],
      ])
    )
    expect(prs[0].inProgressReviewId).toBeNull()
  })

  it('skips reviews whose pr_url cannot be parsed', () => {
    const prs = groupReviewsIntoHistoryPrs([
      row({
        id: 'rev-bad',
        pr_url: 'not-a-pr-url',
        created_at: '2026-08-28T12:00:00Z',
      }),
      row({
        id: 'rev-ok',
        pr_url: 'https://github.com/acme/a/pull/1',
        created_at: '2026-08-27T12:00:00Z',
      }),
    ])
    expect(prs).toHaveLength(1)
    expect(prs[0].reviews[0].id).toBe('rev-ok')
  })

  it('treats null metadata as missing title/author', () => {
    const prs = groupReviewsIntoHistoryPrs([
      row({
        id: 'rev-1',
        pr_url: 'https://github.com/acme/a/pull/1',
        created_at: '2026-08-28T12:00:00Z',
        pr_metadata: null,
      }),
    ])
    expect(prs[0].title).toBeNull()
    expect(prs[0].author).toBeNull()
  })

  it('ignores empty-string metadata fields', () => {
    const prs = groupReviewsIntoHistoryPrs([
      row({
        id: 'rev-1',
        pr_url: 'https://github.com/acme/a/pull/1',
        created_at: '2026-08-28T12:00:00Z',
        pr_metadata: { title: '', author: '' },
      }),
    ])
    expect(prs[0].title).toBeNull()
    expect(prs[0].author).toBeNull()
  })

  it('keeps equal timestamps stable enough to include both PRs', () => {
    const at = '2026-08-28T12:00:00Z'
    const prs = groupReviewsIntoHistoryPrs([
      row({
        id: 'rev-1',
        pr_url: 'https://github.com/acme/a/pull/1',
        created_at: at,
      }),
      row({
        id: 'rev-2',
        pr_url: 'https://github.com/acme/a/pull/2',
        created_at: at,
      }),
      row({
        id: 'rev-1b',
        pr_url: 'https://github.com/acme/a/pull/1',
        created_at: at,
      }),
    ])
    expect(prs).toHaveLength(2)
    expect(prs.find(p => p.prNumber === 1)?.reviews).toHaveLength(2)
  })
})

describe('historyRepoKeys', () => {
  it('returns distinct owner/repo keys sorted alphabetically', () => {
    const prs = groupReviewsIntoHistoryPrs([
      row({
        id: 'r1',
        pr_url: 'https://github.com/zeta/app/pull/1',
        created_at: '2026-08-29T00:00:00Z',
      }),
      row({
        id: 'r2',
        pr_url: 'https://github.com/acme/api/pull/1',
        created_at: '2026-08-28T00:00:00Z',
      }),
      row({
        id: 'r3',
        pr_url: 'https://github.com/acme/api/pull/2',
        created_at: '2026-08-27T00:00:00Z',
      }),
    ])
    expect(historyRepoKeys(prs)).toEqual(['acme/api', 'zeta/app'])
  })
})

describe('filterHistoryPrsByRepos', () => {
  const prs = groupReviewsIntoHistoryPrs([
    row({
      id: 'r1',
      pr_url: 'https://github.com/acme/api/pull/1',
      created_at: '2026-08-29T00:00:00Z',
    }),
    row({
      id: 'r2',
      pr_url: 'https://github.com/zeta/app/pull/1',
      created_at: '2026-08-28T00:00:00Z',
    }),
  ])

  it('returns all PRs when the selection is empty (default all)', () => {
    expect(filterHistoryPrsByRepos(prs, [])).toEqual(prs)
  })

  it('keeps only PRs whose repoKey is selected', () => {
    expect(
      filterHistoryPrsByRepos(prs, ['zeta/app']).map(p => p.repoKey)
    ).toEqual(['zeta/app'])
  })

  it('accepts a Set of repo keys', () => {
    expect(
      filterHistoryPrsByRepos(prs, new Set(['acme/api'])).map(p => p.repoKey)
    ).toEqual(['acme/api'])
  })
})

describe('paginateHistoryPrs', () => {
  const prs = Array.from(
    { length: 30 },
    (_, i) =>
      groupReviewsIntoHistoryPrs([
        row({
          id: `r-${i}`,
          pr_url: `https://github.com/acme/api/pull/${i + 1}`,
          created_at: `2026-08-${String(30 - (i % 28)).padStart(2, '0')}T00:00:00Z`,
        }),
      ])[0]
  )

  it('defaults to HISTORY_PR_PAGE_SIZE', () => {
    expect(paginateHistoryPrs(prs, 0)).toHaveLength(HISTORY_PR_PAGE_SIZE)
  })

  it('slices from the given offset', () => {
    const page = paginateHistoryPrs(prs, 25, 25)
    expect(page).toHaveLength(5)
    expect(page[0].prNumber).toBe(prs[25].prNumber)
  })
})

describe('buildHistoryPayload', () => {
  it('joins tracked rows and lists distinct repos', () => {
    const { prs, repos } = buildHistoryPayload(
      [
        row({
          id: 'rev-1',
          pr_url: 'https://github.com/acme/api/pull/1',
          created_at: '2026-08-29T00:00:00Z',
        }),
      ],
      [
        {
          pr_url: 'https://github.com/acme/api/pull/1',
          pr_title: 'Fix webhook',
          pr_author: 'alice',
          status: TrackedPrStatus.REVIEWED,
        },
      ]
    )
    expect(repos).toEqual(['acme/api'])
    expect(prs[0].title).toBe('Fix webhook')
    expect(prs[0].status).toBe(TrackedPrStatus.REVIEWED)
  })
})

describe('mergeHistoryCatalog', () => {
  it('includes never-reviewed GitHub PRs and overlays chips', () => {
    const prs = mergeHistoryCatalog(
      [
        {
          owner: 'acme',
          repo: 'api',
          prNumber: 10,
          prUrl: 'https://github.com/acme/api/pull/10',
          title: 'Unreviewed',
          author: 'bob',
          githubState: GithubPrState.OPEN,
          updatedAt: '2026-08-30T00:00:00Z',
        },
        {
          owner: 'acme',
          repo: 'api',
          prNumber: 1,
          prUrl: 'https://github.com/acme/api/pull/1',
          title: 'Has reviews',
          author: 'alice',
          githubState: GithubPrState.OPEN,
          updatedAt: '2026-08-29T00:00:00Z',
        },
      ],
      [
        row({
          id: 'rev-1',
          pr_url: 'https://github.com/acme/api/pull/1',
          created_at: '2026-08-28T00:00:00Z',
        }),
      ],
      []
    )
    expect(prs.map(p => p.prNumber)).toEqual([10, 1])
    expect(prs[0].reviews).toEqual([])
    expect(prs[0].latestReviewId).toBeNull()
    expect(latestHistoryReviewHref(prs[0])).toBeNull()
    expect(canStartHistoryReview(prs[0])).toBe(true)
    expect(prs[1].latestReviewId).toBe('rev-1')
    expect(latestHistoryReviewHref(prs[1])).toBe('/review/rev-1')
    expect(canStartHistoryReview(prs[1])).toBe(false)
  })

  it('keeps review-only PRs that missed the GitHub page', () => {
    const prs = mergeHistoryCatalog(
      [],
      [
        row({
          id: 'rev-old',
          pr_url: 'https://github.com/acme/api/pull/99',
          created_at: '2026-08-01T00:00:00Z',
        }),
      ],
      []
    )
    expect(prs).toHaveLength(1)
    expect(prs[0].prNumber).toBe(99)
  })

  it('sets inProgressReviewId from tracked IN_REVIEW', () => {
    const prs = mergeHistoryCatalog(
      [
        {
          owner: 'acme',
          repo: 'api',
          prNumber: 3,
          prUrl: 'https://github.com/acme/api/pull/3',
          title: 'Running',
          author: 'alice',
          githubState: GithubPrState.OPEN,
          updatedAt: '2026-08-29T00:00:00Z',
        },
      ],
      [],
      [
        {
          pr_url: 'https://github.com/acme/api/pull/3',
          pr_title: 'Running',
          pr_author: 'alice',
          status: TrackedPrStatus.IN_REVIEW,
          last_review_id: 'rev-live',
        },
      ]
    )
    expect(prs[0].inProgressReviewId).toBe('rev-live')
    expect(canStartHistoryReview(prs[0])).toBe(false)
  })

  it('uses tracked title when GitHub title is null', () => {
    const prs = mergeHistoryCatalog(
      [
        {
          owner: 'acme',
          repo: 'api',
          prNumber: 8,
          prUrl: 'https://github.com/acme/api/pull/8',
          title: null,
          author: null,
          githubState: GithubPrState.OPEN,
          updatedAt: '2026-08-29T00:00:00Z',
        },
      ],
      [],
      [
        {
          pr_url: 'https://github.com/acme/api/pull/8',
          pr_title: 'From queue',
          pr_author: 'carol',
          status: TrackedPrStatus.OPEN,
        },
      ]
    )
    expect(prs[0].title).toBe('From queue')
    expect(prs[0].author).toBe('carol')
  })
})

describe('filterHistoryCatalog', () => {
  const openReviewed = mergeHistoryCatalog(
    [
      {
        owner: 'acme',
        repo: 'api',
        prNumber: 1,
        prUrl: 'https://github.com/acme/api/pull/1',
        title: 'Open reviewed',
        author: 'a',
        githubState: GithubPrState.OPEN,
        updatedAt: '2026-08-29T00:00:00Z',
      },
      {
        owner: 'acme',
        repo: 'api',
        prNumber: 2,
        prUrl: 'https://github.com/acme/api/pull/2',
        title: 'Closed',
        author: 'a',
        githubState: GithubPrState.CLOSED,
        updatedAt: '2026-08-28T00:00:00Z',
      },
      {
        owner: 'acme',
        repo: 'web',
        prNumber: 3,
        prUrl: 'https://github.com/acme/web/pull/3',
        title: 'Open unreviewed',
        author: 'a',
        githubState: GithubPrState.OPEN,
        updatedAt: '2026-08-27T00:00:00Z',
      },
    ],
    [
      row({
        id: 'rev-1',
        pr_url: 'https://github.com/acme/api/pull/1',
        created_at: '2026-08-20T00:00:00Z',
      }),
    ],
    []
  )

  it('hides closed PRs by default', () => {
    expect(filterHistoryCatalog(openReviewed).map(p => p.prNumber)).toEqual([
      1, 3,
    ])
  })

  it('includes closed when includeClosed is true', () => {
    expect(
      filterHistoryCatalog(openReviewed, { includeClosed: true }).map(
        p => p.prNumber
      )
    ).toEqual([1, 2, 3])
  })

  it('keeps only reviewed PRs when reviewedOnly is true', () => {
    expect(
      filterHistoryCatalog(openReviewed, { reviewedOnly: true }).map(
        p => p.prNumber
      )
    ).toEqual([1])
  })
})

describe('reviewChipsRecord', () => {
  it('keys chips by canonical URL with oldest-first rounds', () => {
    const record = reviewChipsRecord([
      row({
        id: 'rev-new',
        pr_url: 'https://github.com/acme/a/pull/1?foo=1',
        created_at: '2026-08-28T12:00:00Z',
        result: { blockingIssues: [{}], suggestions: [], nits: [] },
      }),
      row({
        id: 'rev-old',
        pr_url: 'https://github.com/acme/a/pull/1',
        created_at: '2026-08-20T12:00:00Z',
        result: { blockingIssues: [], suggestions: [{}], nits: [] },
      }),
      row({
        id: 'rev-bad',
        pr_url: 'not-a-pr-url',
        created_at: '2026-08-21T12:00:00Z',
      }),
    ])
    expect(Object.keys(record)).toEqual(['https://github.com/acme/a/pull/1'])
    expect(record['https://github.com/acme/a/pull/1'].map(c => c.id)).toEqual([
      'rev-old',
      'rev-new',
    ])
    expect(
      record['https://github.com/acme/a/pull/1'].map(c => c.round)
    ).toEqual([1, 2])
  })
})

describe('reviewChipsForPrUrl', () => {
  const chips = [
    {
      id: 'rev-1',
      round: 1,
      createdAt: '2026-08-20T12:00:00Z',
      counts: { blocking: 0, suggestions: 1, nits: 0 },
    },
  ]

  it('looks up by canonical URL when the queue row has a query string', () => {
    expect(
      reviewChipsForPrUrl(
        { 'https://github.com/acme/a/pull/1': chips },
        'https://github.com/acme/a/pull/1#discussion'
      )
    ).toEqual(chips)
  })

  it('returns an empty list when the PR has no COMPLETE reviews', () => {
    expect(reviewChipsForPrUrl({}, 'https://github.com/acme/a/pull/1')).toEqual(
      []
    )
  })

  it('falls back to the raw URL when it cannot be parsed', () => {
    expect(
      reviewChipsForPrUrl({ 'not-a-pr-url': chips }, 'not-a-pr-url')
    ).toEqual(chips)
  })
})
