import {
  GithubPrState,
  githubPrStateFromApi,
  historyPullFromGithub,
  historyPullFromTracked,
} from '../src/lib/github-pull'

describe('githubPrStateFromApi', () => {
  it('maps GitHub lowercase closed to CLOSED', () => {
    expect(githubPrStateFromApi('closed')).toBe(GithubPrState.CLOSED)
    expect(githubPrStateFromApi('CLOSED')).toBe(GithubPrState.CLOSED)
  })

  it('maps anything else to OPEN', () => {
    expect(githubPrStateFromApi('open')).toBe(GithubPrState.OPEN)
    expect(githubPrStateFromApi('')).toBe(GithubPrState.OPEN)
  })
})

describe('historyPullFromGithub', () => {
  it('maps a pulls.list item', () => {
    expect(
      historyPullFromGithub({
        number: 9,
        html_url: 'https://github.com/acme/api/pull/9?foo=1',
        title: 'Fix webhook',
        state: 'open',
        user: { login: 'alice' },
        updated_at: '2026-08-29T00:00:00Z',
        base: { repo: { name: 'api', owner: { login: 'acme' } } },
      })
    ).toEqual({
      owner: 'acme',
      repo: 'api',
      prNumber: 9,
      prUrl: 'https://github.com/acme/api/pull/9',
      title: 'Fix webhook',
      author: 'alice',
      githubState: GithubPrState.OPEN,
      updatedAt: '2026-08-29T00:00:00Z',
    })
  })

  it('returns null when owner/repo are missing', () => {
    expect(
      historyPullFromGithub({
        number: 1,
        html_url: 'https://github.com/acme/api/pull/1',
        state: 'open',
        updated_at: '2026-08-29T00:00:00Z',
      })
    ).toBeNull()
  })

  it('tolerates a missing title and author', () => {
    expect(
      historyPullFromGithub({
        number: 2,
        html_url: 'https://github.com/acme/api/pull/2',
        state: 'open',
        updated_at: '2026-08-29T00:00:00Z',
        base: { repo: { name: 'api', owner: { login: 'acme' } } },
      })
    ).toMatchObject({ title: null, author: null })
  })
})

describe('historyPullFromTracked', () => {
  it('maps a tracked_prs row when GitHub is unavailable', () => {
    expect(
      historyPullFromTracked({
        owner: 'acme',
        repo: 'api',
        pr_number: 4,
        pr_url: 'https://github.com/acme/api/pull/4',
        pr_title: 'Fallback',
        pr_author: 'bob',
        status: 'CLOSED',
        updated_at: '2026-08-29T00:00:00Z',
      })
    ).toMatchObject({
      prNumber: 4,
      githubState: GithubPrState.CLOSED,
      title: 'Fallback',
    })
  })

  it('maps non-CLOSED tracked rows as OPEN', () => {
    expect(
      historyPullFromTracked({
        owner: 'acme',
        repo: 'api',
        pr_number: 5,
        pr_url: 'https://github.com/acme/api/pull/5',
        pr_title: null,
        pr_author: null,
        status: 'OPEN',
        updated_at: '2026-08-29T00:00:00Z',
      }).githubState
    ).toBe(GithubPrState.OPEN)
  })
})
