/**
 * GitHub pull list items mapped into history catalog rows.
 * GitHub's API uses lowercase `open`/`closed`; we store UPPER_CASE.
 */

import { TrackedPrStatus } from './tracked-prs'

export enum GithubPrState {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** One PR as listed for the history catalog (GitHub or tracked_prs fallback). */
export interface HistoryPullSource {
  owner: string
  repo: string
  prNumber: number
  prUrl: string
  title: string | null
  author: string | null
  githubState: GithubPrState
  updatedAt: string
}

/** Cap per configured repo (GitHub first page). */
export const HISTORY_GITHUB_PER_PAGE = 100

/** Map GitHub `state` to GithubPrState. Unknown values count as open. */
export function githubPrStateFromApi(state: string): GithubPrState {
  return state.toLowerCase() === 'closed'
    ? GithubPrState.CLOSED
    : GithubPrState.OPEN
}

/** Map one GitHub pulls.list item into a history pull source. */
export function historyPullFromGithub(item: {
  number: number
  html_url: string
  title?: string | null
  state: string
  user?: { login?: string | null } | null
  updated_at: string
  base?: { repo?: { name?: string; owner?: { login?: string } } }
}): HistoryPullSource | null {
  const owner = item.base?.repo?.owner?.login
  const repo = item.base?.repo?.name
  if (!owner || !repo) return null
  return {
    owner,
    repo,
    prNumber: item.number,
    prUrl: item.html_url.split('?')[0],
    title: item.title ?? null,
    author: item.user?.login ?? null,
    githubState: githubPrStateFromApi(item.state),
    updatedAt: item.updated_at,
  }
}

/** Map a tracked_prs row when GitHub listing is unavailable. */
export function historyPullFromTracked(row: {
  owner: string
  repo: string
  pr_number: number
  pr_url: string
  pr_title: string | null
  pr_author: string | null
  status: string
  updated_at: string
}): HistoryPullSource {
  return {
    owner: row.owner,
    repo: row.repo,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    title: row.pr_title,
    author: row.pr_author,
    githubState:
      row.status === TrackedPrStatus.CLOSED
        ? GithubPrState.CLOSED
        : GithubPrState.OPEN,
    updatedAt: row.updated_at,
  }
}
