/**
 * Fetch open+closed PRs for configured repos (first GitHub page each).
 */

import type { Octokit } from '@octokit/rest'
import {
  HISTORY_GITHUB_PER_PAGE,
  historyPullFromGithub,
  type HistoryPullSource,
} from './github-pull'

/** List PRs for each repo. One failing repo does not drop the others. */
export async function listGithubPullsForRepos(
  octokit: Pick<Octokit, 'pulls'>,
  repos: { owner: string; name: string }[]
): Promise<HistoryPullSource[]> {
  const pages = await Promise.all(
    repos.map(async repo => {
      try {
        const { data } = await octokit.pulls.list({
          owner: repo.owner,
          repo: repo.name,
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          per_page: HISTORY_GITHUB_PER_PAGE,
        })
        return data
          .map(item => historyPullFromGithub(item))
          .filter((row): row is HistoryPullSource => row != null)
      } catch (err) {
        console.warn(
          `[history] GitHub pulls.list failed for ${repo.owner}/${repo.name}:`,
          err
        )
        return []
      }
    })
  )
  return pages.flat()
}
