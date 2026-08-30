/**
 * Group COMPLETE reviews into PR bars for the history page.
 * Pure — no I/O.
 */

import { parsePrUrl, type ParsedPrUrl } from './queue'
import { findingCountsFromResult, type FindingCounts } from './finding-counts'
import { GithubPrState, type HistoryPullSource } from './github-pull'
import { TrackedPrStatus } from './tracked-prs'

/** Safety cap on the reviews query feeding history. */
export const HISTORY_REVIEW_LIMIT = 500

/** PR rows shown before Load more. */
export const HISTORY_PR_PAGE_SIZE = 25

/** One COMPLETE review row as selected for history (no full result in the UI). */
export interface HistoryReviewSource {
  id: string
  pr_url: string
  pr_metadata: Record<string, unknown> | null
  result: unknown
  created_at: string
}

/** Queue-row fields joined onto a history PR when the PR is still tracked. */
export interface TrackedPrHistoryMeta {
  pr_title: string | null
  pr_author: string | null
  status: string
  last_review_id?: string | null
}

/** `tracked_prs` row as selected for history join. */
export interface TrackedPrHistoryRow extends TrackedPrHistoryMeta {
  pr_url: string
}

/** One COMPLETE round chip under a history PR bar. Oldest = round 1. */
export interface HistoryReviewChip {
  id: string
  round: number
  createdAt: string
  counts: FindingCounts
}

/** One PR on the history page, with chips oldest → newest. */
export interface HistoryPr {
  prUrl: string
  owner: string
  repo: string
  prNumber: number
  repoKey: string
  title: string | null
  author: string | null
  status: string | null
  lastReviewedAt: string
  githubState: GithubPrState
  updatedAt: string
  latestReviewId: string | null
  inProgressReviewId: string | null
  reviews: HistoryReviewChip[]
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function metaString(
  metadata: Record<string, unknown> | null,
  key: string
): string | null {
  if (!metadata) return null
  return asString(metadata[key])
}

function inProgressReviewId(
  tracked: TrackedPrHistoryMeta | undefined
): string | null {
  if (tracked?.status !== TrackedPrStatus.IN_REVIEW) return null
  return tracked.last_review_id ?? null
}

function githubStateFromTracked(
  tracked: TrackedPrHistoryMeta | undefined
): GithubPrState {
  if (tracked?.status === TrackedPrStatus.CLOSED) return GithubPrState.CLOSED
  return GithubPrState.OPEN
}

function compareIsoAsc(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function groupReviewsByCanonicalUrl(
  reviews: HistoryReviewSource[]
): Map<string, { parsed: ParsedPrUrl; rows: HistoryReviewSource[] }> {
  const byUrl = new Map<
    string,
    { parsed: ParsedPrUrl; rows: HistoryReviewSource[] }
  >()
  for (const review of reviews) {
    const parsed = parsePrUrl(review.pr_url)
    if (!parsed) continue
    const existing = byUrl.get(parsed.canonical_url)
    byUrl.set(parsed.canonical_url, {
      parsed,
      rows: existing ? [...existing.rows, review] : [review],
    })
  }
  return byUrl
}

function sortedReviewRows(rows: HistoryReviewSource[]): HistoryReviewSource[] {
  return [...rows].sort((a, b) => compareIsoAsc(a.created_at, b.created_at))
}

function chipsFromRows(rows: HistoryReviewSource[]): HistoryReviewChip[] {
  return sortedReviewRows(rows).map((row, index) => ({
    id: row.id,
    round: index + 1,
    createdAt: row.created_at,
    counts: findingCountsFromResult(row.result),
  }))
}

/**
 * COMPLETE review chips keyed by canonical PR URL.
 * Oldest chip first; unparseable URLs are omitted.
 */
export function reviewChipsRecord(
  reviews: HistoryReviewSource[]
): Record<string, HistoryReviewChip[]> {
  const record: Record<string, HistoryReviewChip[]> = {}
  for (const [url, group] of groupReviewsByCanonicalUrl(reviews)) {
    record[url] = chipsFromRows(group.rows)
  }
  return record
}

/** Chips for a queue/history PR URL, canonicalizing query/hash. */
export function reviewChipsForPrUrl(
  chipsByUrl: Record<string, HistoryReviewChip[]>,
  prUrl: string
): HistoryReviewChip[] {
  const parsed = parsePrUrl(prUrl)
  const key = parsed?.canonical_url ?? prUrl
  return chipsByUrl[key] ?? []
}

/**
 * Group review rows into PR bars.
 * Newest last-review first. Chips within a PR are oldest-first with 1-based rounds.
 * Unparseable `pr_url` rows are skipped. Untracked PRs still appear (status null).
 */
export function groupReviewsIntoHistoryPrs(
  reviews: HistoryReviewSource[],
  trackedByUrl?: Map<string, TrackedPrHistoryMeta>
): HistoryPr[] {
  const prs: HistoryPr[] = []
  for (const [prUrl, group] of groupReviewsByCanonicalUrl(reviews)) {
    const chips = chipsFromRows(group.rows)
    const latest = sortedReviewRows(group.rows)[
      group.rows.length - 1
    ] as HistoryReviewSource
    const tracked = trackedByUrl?.get(prUrl)
    const metadata = latest.pr_metadata
    prs.push({
      prUrl,
      owner: group.parsed.owner,
      repo: group.parsed.repo,
      prNumber: group.parsed.pr_number,
      repoKey: `${group.parsed.owner}/${group.parsed.repo}`,
      title: tracked?.pr_title ?? metaString(metadata, 'title'),
      author: tracked?.pr_author ?? metaString(metadata, 'author'),
      status: tracked?.status ?? null,
      lastReviewedAt: latest.created_at,
      githubState: githubStateFromTracked(tracked),
      updatedAt: latest.created_at,
      latestReviewId: chips[chips.length - 1]?.id ?? null,
      inProgressReviewId: inProgressReviewId(tracked),
      reviews: chips,
    })
  }

  return prs.sort((a, b) => compareIsoAsc(b.lastReviewedAt, a.lastReviewedAt))
}

/** Distinct `owner/repo` keys, sorted, for the history filter. */
export function historyRepoKeys(prs: HistoryPr[]): string[] {
  const keys = new Set(prs.map(pr => pr.repoKey))
  return [...keys].sort((a, b) => a.localeCompare(b))
}

/**
 * Filter PR bars by selected repo keys.
 * Empty selection means all (the default).
 */
export function filterHistoryPrsByRepos(
  prs: HistoryPr[],
  selectedRepos: readonly string[] | Set<string>
): HistoryPr[] {
  const selected =
    selectedRepos instanceof Set ? selectedRepos : new Set(selectedRepos)
  if (selected.size === 0) return prs
  return prs.filter(pr => selected.has(pr.repoKey))
}

/** Slice PR bars for Load more. `limit` defaults to HISTORY_PR_PAGE_SIZE. */
export function paginateHistoryPrs(
  prs: HistoryPr[],
  offset: number,
  limit: number = HISTORY_PR_PAGE_SIZE
): HistoryPr[] {
  return prs.slice(offset, offset + limit)
}

/** Latest COMPLETE review path, or null when this PR has never been reviewed. */
export function latestHistoryReviewHref(pr: HistoryPr): string | null {
  return pr.latestReviewId ? `/review/${pr.latestReviewId}` : null
}

/** Start Review on History: never-reviewed and not currently running. */
export function canStartHistoryReview(pr: HistoryPr): boolean {
  return pr.reviews.length === 0 && pr.inProgressReviewId == null
}

export interface HistoryCatalogFilters {
  includeClosed?: boolean
  reviewedOnly?: boolean
  selectedRepos?: readonly string[] | Set<string>
}

/** Apply Closed / Reviewed-only / repo filters. Defaults: open only, all review states. */
export function filterHistoryCatalog(
  prs: HistoryPr[],
  options: HistoryCatalogFilters = {}
): HistoryPr[] {
  const includeClosed = options.includeClosed ?? false
  const reviewedOnly = options.reviewedOnly ?? false
  let next = filterHistoryPrsByRepos(prs, options.selectedRepos ?? [])
  if (!includeClosed) {
    next = next.filter(pr => pr.githubState !== GithubPrState.CLOSED)
  }
  if (reviewedOnly) {
    next = next.filter(pr => pr.reviews.length > 0)
  }
  return next
}

/**
 * Merge GitHub (or tracked fallback) pulls with COMPLETE review chips.
 * Review-only PRs that missed the GitHub page cap are still included.
 */
export function mergeHistoryCatalog(
  pulls: HistoryPullSource[],
  reviews: HistoryReviewSource[],
  trackedRows: TrackedPrHistoryRow[]
): HistoryPr[] {
  const trackedByUrl = new Map<string, TrackedPrHistoryMeta>(
    trackedRows.map(row => [
      row.pr_url,
      {
        pr_title: row.pr_title,
        pr_author: row.pr_author,
        status: row.status,
        last_review_id: row.last_review_id,
      },
    ])
  )
  const reviewPrs = groupReviewsIntoHistoryPrs(reviews, trackedByUrl)
  const reviewByUrl = new Map(reviewPrs.map(pr => [pr.prUrl, pr]))
  const merged: HistoryPr[] = []
  const seen = new Set<string>()

  for (const pull of pulls) {
    seen.add(pull.prUrl)
    const existing = reviewByUrl.get(pull.prUrl)
    const tracked = trackedByUrl.get(pull.prUrl)
    merged.push({
      prUrl: pull.prUrl,
      owner: pull.owner,
      repo: pull.repo,
      prNumber: pull.prNumber,
      repoKey: `${pull.owner}/${pull.repo}`,
      title: pull.title ?? existing?.title ?? tracked?.pr_title ?? null,
      author: pull.author ?? existing?.author ?? tracked?.pr_author ?? null,
      status: tracked?.status ?? existing?.status ?? null,
      lastReviewedAt: existing?.lastReviewedAt ?? pull.updatedAt,
      githubState: pull.githubState,
      updatedAt: pull.updatedAt,
      reviews: existing?.reviews ?? [],
      latestReviewId: existing?.latestReviewId ?? null,
      inProgressReviewId:
        inProgressReviewId(tracked) ?? existing?.inProgressReviewId ?? null,
    })
  }

  for (const pr of reviewPrs) {
    if (seen.has(pr.prUrl)) continue
    merged.push(pr)
  }

  return merged.sort((a, b) => compareIsoAsc(b.updatedAt, a.updatedAt))
}

/** Group reviews and tracked rows into the history API/page payload. */
export function buildHistoryPayload(
  reviews: HistoryReviewSource[],
  trackedRows: TrackedPrHistoryRow[]
): { prs: HistoryPr[]; repos: string[] } {
  const prs = mergeHistoryCatalog([], reviews, trackedRows)
  return { prs, repos: historyRepoKeys(prs) }
}
