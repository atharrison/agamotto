import { listGithubPullsForRepos } from '../src/lib/list-github-pulls'
import { GithubPrState } from '../src/lib/github-pull'

describe('listGithubPullsForRepos', () => {
  it('lists pulls for each repo and skips a failing repo', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            number: 1,
            html_url: 'https://github.com/acme/api/pull/1',
            title: 'One',
            state: 'open',
            user: { login: 'alice' },
            updated_at: '2026-08-29T00:00:00Z',
            base: { repo: { name: 'api', owner: { login: 'acme' } } },
          },
        ],
      })
      .mockRejectedValueOnce(new Error('403'))

    const pulls = await listGithubPullsForRepos({ pulls: { list } } as never, [
      { owner: 'acme', name: 'api' },
      { owner: 'acme', name: 'web' },
    ])

    expect(pulls).toHaveLength(1)
    expect(pulls[0].githubState).toBe(GithubPrState.OPEN)
    expect(list).toHaveBeenCalledTimes(2)
  })
})
