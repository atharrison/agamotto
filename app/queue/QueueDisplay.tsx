'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrackedPrStatus,
  inProgressReviewHref,
} from '../../src/lib/tracked-prs'
import {
  reviewChipsForPrUrl,
  type HistoryReviewChip,
} from '../../src/lib/history-prs'
import { withoutStaleClosed } from '../../src/lib/stale-closed'
import {
  DEFAULT_QUEUE_VIEW,
  QUEUE_VIEW_STORAGE_KEY,
  allCollapsed,
  parseQueueView,
  repoCounts,
  serializeQueueView,
  setCollapsed,
  toggleKey,
  withoutHiddenRepos,
  type QueueViewState,
} from '../../src/lib/queue-view'
import { ReviewRunningLink } from '../components/ReviewRunningLink'
import { ReviewRoundChips } from '../components/ReviewRoundChips'

interface TrackedPr {
  id: string
  owner: string
  repo: string
  pr_number: number
  pr_url: string
  pr_title: string | null
  pr_author: string | null
  pr_opened_at: string | null
  status: string
  updated_since_review: boolean
  review_count: number
  last_review_id?: string | null
  pr_closed_at?: string | null
  updated_at?: string | null
  created_at: string
}

type RepoGroup = { key: string; owner: string; repo: string; prs: TrackedPr[] }

const STATUS_BADGE: Record<
  TrackedPrStatus,
  { label: string; className: string }
> = {
  [TrackedPrStatus.OPEN]: {
    label: 'Open',
    className: 'bg-blue-900/50 text-blue-300 border-blue-800',
  },
  [TrackedPrStatus.IN_REVIEW]: {
    label: 'In Review',
    className: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  },
  [TrackedPrStatus.READY]: {
    label: 'Ready',
    className: 'bg-indigo-900/50 text-indigo-300 border-indigo-800',
  },
  [TrackedPrStatus.REVIEWED]: {
    label: 'Reviewed',
    className: 'bg-green-900/50 text-green-300 border-green-800',
  },
  [TrackedPrStatus.CLOSED]: {
    label: 'Closed',
    className: 'bg-gray-800/80 text-gray-500 border-gray-700',
  },
}

function StatusBadge({ status }: { status: string }) {
  const badge =
    STATUS_BADGE[status as TrackedPrStatus] ??
    STATUS_BADGE[TrackedPrStatus.OPEN]
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  )
}

function groupByRepo(prs: TrackedPr[]): RepoGroup[] {
  const map = new Map<string, RepoGroup>()
  for (const pr of prs) {
    const key = `${pr.owner}/${pr.repo}`
    if (!map.has(key)) {
      map.set(key, { key, owner: pr.owner, repo: pr.repo, prs: [] })
    }
    map.get(key)!.prs.push(pr)
  }
  return Array.from(map.values())
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type StatusFilter = 'ALL' | TrackedPrStatus

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: TrackedPrStatus.OPEN, label: 'Open' },
  { value: TrackedPrStatus.IN_REVIEW, label: 'In Review' },
  { value: TrackedPrStatus.READY, label: 'Ready' },
  { value: TrackedPrStatus.REVIEWED, label: 'Reviewed' },
  { value: TrackedPrStatus.CLOSED, label: 'Closed' },
]

export default function QueueDisplay({
  initialPrs,
  reviewChips,
}: {
  initialPrs: TrackedPr[]
  reviewChips: Record<string, HistoryReviewChip[]>
  userName?: string
}) {
  const router = useRouter()
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [startingIds, setStartingIds] = useState<Set<string>>(new Set())
  const [startError, setStartError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const inboxPrs = withoutStaleClosed(initialPrs)

  // ATH-62: collapse / repo-filter state, persisted per browser. Read after
  // mount (not in the initial state) so SSR and first client render match;
  // `viewLoaded` stops the default state from overwriting saved state.
  const [view, setView] = useState<QueueViewState>(DEFAULT_QUEUE_VIEW)
  const [viewLoaded, setViewLoaded] = useState(false)
  useEffect(() => {
    try {
      setView(parseQueueView(localStorage.getItem(QUEUE_VIEW_STORAGE_KEY)))
    } catch {
      // Storage unavailable (private mode / blocked): keep defaults.
    }
    setViewLoaded(true)
  }, [])
  useEffect(() => {
    if (!viewLoaded) return
    try {
      localStorage.setItem(QUEUE_VIEW_STORAGE_KEY, serializeQueueView(view))
    } catch {
      // Best-effort persistence only.
    }
  }, [view, viewLoaded])

  async function handleStartReview(pr: TrackedPr) {
    setStartingIds(prev => new Set(prev).add(pr.id))
    setStartError(null)
    try {
      const res = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prUrl: pr.pr_url }),
      })
      if (!res.ok) {
        console.error('[QueueDisplay] review start failed', await res.text())
        setStartError('Failed to start review — please try again.')
        return
      }
      const { reviewId } = (await res.json()) as { reviewId: string }
      // Validate before using in navigation to guard against unexpected server responses
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          reviewId
        )
      ) {
        console.error('[QueueDisplay] unexpected reviewId format', reviewId)
        setStartError('Unexpected server response — please try again.')
        return
      }
      router.push(`/review/${reviewId}?prUrl=${encodeURIComponent(pr.pr_url)}`)
    } catch (err) {
      console.error('[QueueDisplay] review start error', err)
      setStartError('Failed to start review — please try again.')
    } finally {
      setStartingIds(prev => {
        const next = new Set(prev)
        next.delete(pr.id)
        return next
      })
    }
  }

  async function handleRemove(pr: TrackedPr) {
    if (
      !confirm(`Remove ${pr.owner}/${pr.repo} #${pr.pr_number} from the queue?`)
    )
      return
    setRemovingId(pr.id)
    try {
      await fetch(`/api/queue/${pr.id}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setRemovingId(null)
    }
  }

  // Repo filter first, so the status tab counts reflect the visible repos.
  const repos = repoCounts(inboxPrs)
  const repoPrs = withoutHiddenRepos(inboxPrs, view.hiddenRepos)
  const filteredPrs =
    statusFilter === 'ALL'
      ? repoPrs
      : repoPrs.filter(pr => pr.status === statusFilter)

  const groups = groupByRepo(filteredPrs)
  const groupKeys = groups.map(g => g.key)
  const everythingCollapsed = allCollapsed(view.collapsedRepos, groupKeys)

  const filterBar = (
    <div className="flex items-center gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
      {FILTER_TABS.map(tab => {
        const count =
          tab.value === 'ALL'
            ? repoPrs.length
            : repoPrs.filter(p => p.status === tab.value).length
        const active = statusFilter === tab.value
        return (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? 'bg-gray-600 text-gray-200' : 'text-gray-600'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  if (inboxPrs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-800 py-16 text-center">
        <p className="text-gray-500">Inbox is empty.</p>
        <p className="mt-1 text-sm text-gray-600">
          Paste a GitHub PR URL above to add one, or configure webhooks in
          Settings. Closed PRs older than 24 hours live on History.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {filterBar}
      {(repos.length > 1 || groups.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {repos.length > 1 && (
            <>
              <span className="text-xs text-gray-500">Repos:</span>
              <button
                onClick={() => setView(v => ({ ...v, hiddenRepos: [] }))}
                aria-pressed={view.hiddenRepos.length === 0}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  view.hiddenRepos.length === 0
                    ? 'border-indigo-700 bg-indigo-950/50 text-indigo-300'
                    : 'border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                All
              </button>
              {repos.map(({ key, count }) => {
                const shown = !view.hiddenRepos.includes(key)
                return (
                  <button
                    key={key}
                    onClick={() =>
                      setView(v => ({
                        ...v,
                        hiddenRepos: toggleKey(v.hiddenRepos, key),
                      }))
                    }
                    aria-pressed={shown}
                    className={`rounded-md border px-2.5 py-1 text-xs transition ${
                      shown
                        ? 'border-indigo-700 bg-indigo-950/50 text-indigo-300'
                        : 'border-gray-700 text-gray-500 line-through hover:text-gray-300'
                    }`}
                  >
                    {key}
                    <span className="ml-1.5 text-[10px] text-gray-500">
                      {count}
                    </span>
                  </button>
                )
              })}
            </>
          )}
          {groups.length > 0 && (
            <button
              onClick={() =>
                setView(v => ({
                  ...v,
                  collapsedRepos: setCollapsed(
                    v.collapsedRepos,
                    groupKeys,
                    !everythingCollapsed
                  ),
                }))
              }
              className="ml-auto rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-400 transition hover:border-gray-600 hover:text-gray-200"
            >
              {everythingCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>
      )}
      {startError && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-400">
          {startError}
        </div>
      )}
      {groups.length === 0 &&
        (repoPrs.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            All repos are hidden by the repo filter.{' '}
            <button
              onClick={() => setView(v => ({ ...v, hiddenRepos: [] }))}
              className="text-indigo-400 underline hover:text-indigo-300"
            >
              Show all
            </button>
          </p>
        ) : (
          <p className="py-8 text-center text-sm text-gray-500">
            No {statusFilter.toLowerCase().replace('_', ' ')} PRs.
          </p>
        ))}
      {groups.map(group => {
        const collapsed = view.collapsedRepos.includes(group.key)
        return (
          <section key={group.key}>
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={() =>
                  setView(v => ({
                    ...v,
                    collapsedRepos: toggleKey(v.collapsedRepos, group.key),
                  }))
                }
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.key}`}
                className="flex h-5 w-5 items-center justify-center rounded text-xs text-gray-500 transition hover:bg-gray-800 hover:text-gray-200"
              >
                <span
                  aria-hidden
                  className={`inline-block transition-transform ${collapsed ? '' : 'rotate-90'}`}
                >
                  ▶
                </span>
              </button>
              <a
                href={`https://github.com/${group.owner}/${group.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-gray-200 transition hover:text-indigo-300"
              >
                {group.owner}/{group.repo}
              </a>
              <span className="text-xs text-gray-600">
                {group.prs.length} PR{group.prs.length !== 1 ? 's' : ''}
              </span>
            </div>

            {!collapsed && (
              <div className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-900">
                {group.prs.map(pr => {
                  const isRemoving = removingId === pr.id
                  const isStarting = startingIds.has(pr.id)
                  const isClosed = pr.status === TrackedPrStatus.CLOSED
                  const isReviewed =
                    pr.status === TrackedPrStatus.REVIEWED ||
                    pr.status === TrackedPrStatus.READY
                  const isOpen = pr.status === TrackedPrStatus.OPEN
                  const liveHref = inProgressReviewHref(pr)
                  const chips = reviewChipsForPrUrl(reviewChips, pr.pr_url)

                  return (
                    <div
                      key={pr.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div
                        className={`min-w-0 flex-1 ${isClosed ? 'opacity-50' : ''}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={pr.pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-white transition hover:text-indigo-300"
                          >
                            #{pr.pr_number}
                            {pr.pr_title && (
                              <span className="ml-1.5 font-normal text-gray-300">
                                {pr.pr_title}
                              </span>
                            )}
                          </a>
                          <StatusBadge status={pr.status} />
                          {pr.updated_since_review && (
                            <span className="inline-flex items-center gap-1 rounded border border-amber-800 bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300">
                              ⟳ Updated
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          {pr.pr_author && <span>@{pr.pr_author}</span>}
                          {pr.pr_opened_at && (
                            <span>opened {formatDate(pr.pr_opened_at)}</span>
                          )}
                          {pr.review_count > 0 && (
                            <span className="text-gray-600">
                              {pr.review_count} review
                              {pr.review_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ATH-59: capped so the chip strip wraps inside this group
                          (row grows taller) instead of growing wide and squeezing
                          the PR title column. */}
                      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:max-w-[min(50%,32rem)]">
                        <ReviewRoundChips reviews={chips} />
                        {(isOpen || pr.updated_since_review) && !isClosed && (
                          <button
                            onClick={() => handleStartReview(pr)}
                            disabled={isStarting}
                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                          >
                            {isStarting
                              ? '…'
                              : isReviewed
                                ? 'Re-review'
                                : 'Start Review'}
                          </button>
                        )}
                        {isReviewed && !pr.updated_since_review && (
                          <button
                            onClick={() => handleStartReview(pr)}
                            disabled={isStarting}
                            className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:border-gray-600 hover:text-gray-200 disabled:opacity-50"
                          >
                            {isStarting ? '…' : 'Re-review'}
                          </button>
                        )}
                        {pr.status === TrackedPrStatus.IN_REVIEW &&
                          liveHref && <ReviewRunningLink href={liveHref} />}
                        {pr.status === TrackedPrStatus.IN_REVIEW &&
                          !liveHref && (
                            <span className="rounded-md border border-yellow-800 px-3 py-1.5 text-xs font-medium text-yellow-400">
                              Reviewing…
                            </span>
                          )}
                        <button
                          onClick={() => handleRemove(pr)}
                          disabled={isRemoving}
                          className="rounded-md border border-gray-800 px-2.5 py-1.5 text-xs text-gray-600 transition hover:border-red-900 hover:text-red-400 disabled:opacity-50"
                          aria-label="Remove from queue"
                        >
                          {isRemoving ? '…' : '×'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
