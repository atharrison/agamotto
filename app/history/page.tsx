import Link from 'next/link'
import { cookies } from 'next/headers'
import {
  createSupabaseServiceRoleClient,
  getGitHubToken,
} from '../../src/lib/supabase/server'
import { createOctokit } from '../../src/tools/github'
import { listGithubPullsForRepos } from '../../src/lib/list-github-pulls'
import { historyPullFromTracked } from '../../src/lib/github-pull'
import {
  historyRepoKeys,
  mergeHistoryCatalog,
  type TrackedPrHistoryRow,
} from '../../src/lib/history-prs'
import {
  HistoryFilterCookie,
  historyFiltersFromCookieValues,
} from '../../src/lib/history-filters'
import { SettingsFrom } from '../../src/lib/settings-back'
import { listCompleteReviewsForHistory } from '../../src/memory/review-store'
import HistoryDisplay from './HistoryDisplay'

export const dynamic = 'force-dynamic'

export default async function HistoryPage() {
  const cookieStore = await cookies()
  const initialFilters = historyFiltersFromCookieValues({
    closed: cookieStore.get(HistoryFilterCookie.CLOSED)?.value,
    reviewed: cookieStore.get(HistoryFilterCookie.REVIEWED)?.value,
  })
  const service = createSupabaseServiceRoleClient()
  const { data: configured } = await service
    .from('configured_repos')
    .select('owner, name')
    .eq('active', true)

  const repos = configured ?? []
  const configuredKeys = new Set(repos.map(r => `${r.owner}/${r.name}`))

  const token = await getGitHubToken()
  const octokit = createOctokit(token)
  let pulls = octokit ? await listGithubPullsForRepos(octokit, repos) : []

  const { data: trackedRows } = await service
    .from('tracked_prs')
    .select(
      'owner, repo, pr_number, pr_url, pr_title, pr_author, status, last_review_id, updated_at'
    )

  const trackedForRepos = (trackedRows ?? []).filter(row =>
    configuredKeys.has(`${row.owner}/${row.repo}`)
  )

  if (pulls.length === 0 && trackedForRepos.length > 0) {
    pulls = trackedForRepos.map(historyPullFromTracked)
  }

  const reviews = await listCompleteReviewsForHistory()
  const trackedMeta: TrackedPrHistoryRow[] = (trackedRows ?? []).map(row => ({
    pr_url: row.pr_url,
    pr_title: row.pr_title,
    pr_author: row.pr_author,
    status: row.status,
    last_review_id: row.last_review_id,
  }))

  const prs = mergeHistoryCatalog(pulls, reviews, trackedMeta).filter(
    pr => configuredKeys.size === 0 || configuredKeys.has(pr.repoKey)
  )
  const repoKeys = historyRepoKeys(prs)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Review History
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {prs.length} PR{prs.length !== 1 ? 's' : ''}
            {repos.length > 0 && (
              <span className="ml-2 text-gray-600">
                · {repos.length} configured repo
                {repos.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <Link
          href={`/queue/settings?from=${SettingsFrom.HISTORY.toLowerCase()}`}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 transition hover:border-gray-600 hover:text-white"
        >
          ⚙ Settings
        </Link>
      </div>

      <HistoryDisplay
        initialPrs={prs}
        repos={repoKeys}
        initialFilters={initialFilters}
      />
    </div>
  )
}
