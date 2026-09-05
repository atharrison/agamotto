'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  HISTORY_PR_PAGE_SIZE,
  canStartHistoryReview,
  filterHistoryCatalog,
  latestHistoryReviewHref,
  paginateHistoryPrs,
  type HistoryPr,
} from '../../src/lib/history-prs'
import {
  HistoryFilterCookie,
  historyFilterSetCookie,
  type HistoryFilterState,
} from '../../src/lib/history-filters'
import {
  TrackedPrStatus,
  inProgressReviewHref,
} from '../../src/lib/tracked-prs'
import { ReviewRoundChips } from '../components/ReviewRoundChips'
import { ReviewRunningLink } from '../components/ReviewRunningLink'

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
  const badge = STATUS_BADGE[status as TrackedPrStatus]
  if (!badge) return null
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function HistoryDisplay({
  initialPrs,
  repos,
  initialFilters,
}: {
  initialPrs: HistoryPr[]
  repos: string[]
  initialFilters: HistoryFilterState
}) {
  const router = useRouter()
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [includeClosed, setIncludeClosed] = useState(
    initialFilters.includeClosed
  )
  const [reviewedOnly, setReviewedOnly] = useState(initialFilters.reviewedOnly)
  const [visibleCount, setVisibleCount] = useState(HISTORY_PR_PAGE_SIZE)
  const [startingUrls, setStartingUrls] = useState<Set<string>>(new Set())
  const [startError, setStartError] = useState<string | null>(null)

  function persistFilters(next: HistoryFilterState) {
    document.cookie = historyFilterSetCookie(
      HistoryFilterCookie.CLOSED,
      next.includeClosed
    )
    document.cookie = historyFilterSetCookie(
      HistoryFilterCookie.REVIEWED,
      next.reviewedOnly
    )
  }

  function resetPaging() {
    setVisibleCount(HISTORY_PR_PAGE_SIZE)
  }

  function toggleRepo(repoKey: string) {
    resetPaging()
    setSelectedRepos(prev =>
      prev.includes(repoKey)
        ? prev.filter(k => k !== repoKey)
        : [...prev, repoKey]
    )
  }

  async function handleStartReview(pr: HistoryPr) {
    setStartingUrls(prev => new Set(prev).add(pr.prUrl))
    setStartError(null)
    try {
      const res = await fetch('/api/review/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prUrl: pr.prUrl }),
      })
      if (!res.ok) {
        console.error('[HistoryDisplay] review start failed', await res.text())
        setStartError('Failed to start review — please try again.')
        return
      }
      const { reviewId } = (await res.json()) as { reviewId: string }
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          reviewId
        )
      ) {
        setStartError('Unexpected server response — please try again.')
        return
      }
      router.push(`/review/${reviewId}?prUrl=${encodeURIComponent(pr.prUrl)}`)
    } catch (err) {
      console.error('[HistoryDisplay] review start error', err)
      setStartError('Failed to start review — please try again.')
    } finally {
      setStartingUrls(prev => {
        const next = new Set(prev)
        next.delete(pr.prUrl)
        return next
      })
    }
  }

  const filtered = filterHistoryCatalog(initialPrs, {
    includeClosed,
    reviewedOnly,
    selectedRepos,
  })
  const visible = paginateHistoryPrs(filtered, 0, visibleCount)
  const remaining = filtered.length - visible.length

  if (initialPrs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-800 py-16 text-center">
        <p className="text-gray-500">No pull requests yet.</p>
        <p className="mt-1 text-sm text-gray-600">
          Add a repo in Settings, or wait for GitHub webhooks to land.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={e => {
              resetPaging()
              const next = e.target.checked
              setIncludeClosed(next)
              persistFilters({ includeClosed: next, reviewedOnly })
            }}
            className="rounded border-gray-600 bg-gray-900 text-indigo-500"
          />
          Closed
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={reviewedOnly}
            onChange={e => {
              resetPaging()
              const next = e.target.checked
              setReviewedOnly(next)
              persistFilters({ includeClosed, reviewedOnly: next })
            }}
            className="rounded border-gray-600 bg-gray-900 text-indigo-500"
          />
          Reviewed only
        </label>
      </div>

      {repos.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
          <button
            type="button"
            onClick={() => {
              resetPaging()
              setSelectedRepos([])
            }}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              selectedRepos.length === 0
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            All
          </button>
          {repos.map(repoKey => {
            const active = selectedRepos.includes(repoKey)
            return (
              <button
                type="button"
                key={repoKey}
                onClick={() => toggleRepo(repoKey)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {repoKey}
              </button>
            )
          })}
        </div>
      )}

      {startError && (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-400">
          {startError}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">
          No pull requests match these filters.
        </p>
      )}

      <div className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-900">
        {visible.map(pr => {
          const titleHref = latestHistoryReviewHref(pr)
          const liveHref = inProgressReviewHref({
            status: pr.status ?? '',
            last_review_id: pr.inProgressReviewId,
          })
          const showStart = canStartHistoryReview(pr)
          const isStarting = startingUrls.has(pr.prUrl)

          return (
            <div
              key={pr.prUrl}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">{pr.repoKey}</span>
                  <a
                    href={pr.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
                  >
                    #{pr.prNumber}
                  </a>
                  {titleHref && pr.title ? (
                    <Link
                      href={titleHref}
                      className="text-sm text-gray-300 transition hover:text-indigo-300"
                    >
                      {pr.title}
                    </Link>
                  ) : (
                    pr.title && (
                      <span className="text-sm text-gray-300">{pr.title}</span>
                    )
                  )}
                  {pr.status && <StatusBadge status={pr.status} />}
                </div>
                {(pr.author || pr.reviews.length > 0) && (
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    {pr.author && <span>@{pr.author}</span>}
                    {pr.reviews.length > 0 && (
                      <span className="text-gray-600">
                        {pr.reviews.length} review
                        {pr.reviews.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {pr.reviews.length > 0 && (
                      <span>last reviewed {formatDate(pr.lastReviewedAt)}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
                <ReviewRoundChips reviews={pr.reviews} />
                {liveHref && <ReviewRunningLink href={liveHref} />}
                {showStart && (
                  <button
                    type="button"
                    onClick={() => handleStartReview(pr)}
                    disabled={isStarting}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isStarting ? '…' : 'Start Review'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {remaining > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() =>
              setVisibleCount(count => count + HISTORY_PR_PAGE_SIZE)
            }
            className="rounded-md border border-gray-700 px-4 py-1.5 text-xs font-medium text-gray-300 transition hover:border-indigo-700 hover:text-indigo-300"
          >
            Load more ({remaining} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
