/**
 * Tracked-PR status enum and payload builders for the review-lifecycle
 * sync (ATH-15). Pure — no I/O.
 *
 * `review_count` is incremented by the `tracked_prs_on_reviewed` DB trigger
 * when status transitions to REVIEWED. Do not increment it in application code.
 */

import type { ParsedPrUrl } from './queue'

/**
 * Lifecycle status on `tracked_prs.status` (text column, not a Postgres enum).
 *
 * OPEN — awaiting review (new, or new commits after READY/REVIEWED)
 * IN_REVIEW — pipeline running; queue shows a spinner
 * READY — pipeline COMPLETE, human has not saved or posted yet
 * REVIEWED — human saved findings or posted to GitHub (`review_count` trigger)
 * CLOSED — PR merged or closed on GitHub
 */
export enum TrackedPrStatus {
  OPEN = 'OPEN',
  IN_REVIEW = 'IN_REVIEW',
  READY = 'READY',
  REVIEWED = 'REVIEWED',
  CLOSED = 'CLOSED',
}

/** PATCH /api/queue/[id] and queue filters. */
export const TRACKED_PR_STATUS_VALUES = Object.values(TrackedPrStatus)

export function isTrackedPrStatus(value: string): value is TrackedPrStatus {
  return (TRACKED_PR_STATUS_VALUES as string[]).includes(value)
}

/**
 * New commits invalidate a finished-but-unsubmitted run the same way they
 * invalidate a submitted one. IN_REVIEW stays — the live pipeline sees HEAD.
 */
export const SYNC_INVALIDATES_STATUSES: readonly TrackedPrStatus[] = [
  TrackedPrStatus.REVIEWED,
  TrackedPrStatus.READY,
]

/** Queue upsert payload when a review starts (always IN_REVIEW). */
export interface TrackedPrInReviewUpsert {
  owner: string
  repo: string
  pr_number: number
  pr_url: string
  status: TrackedPrStatus.IN_REVIEW
  last_review_id?: string
}

/** Queue patch when the pipeline completes. Does not increment `review_count`. */
export interface TrackedPrReadyPatch {
  status: TrackedPrStatus.READY
  last_review_id: string
}

/** Queue patch applied on finalize. `review_count` is trigger-owned — do not set it here. */
export interface TrackedPrReviewedPatch {
  status: TrackedPrStatus.REVIEWED
  last_review_id: string
}

/** Payload for upserting a queue row when a review starts.
 *
 * Always IN_REVIEW — including when the existing row is CLOSED. Starting a
 * review is an explicit user action and records that intent on the queue.
 */
export function buildInReviewUpsert(
  parsed: ParsedPrUrl,
  reviewId: string | null
): TrackedPrInReviewUpsert {
  const row: TrackedPrInReviewUpsert = {
    owner: parsed.owner,
    repo: parsed.repo,
    pr_number: parsed.pr_number,
    pr_url: parsed.canonical_url,
    status: TrackedPrStatus.IN_REVIEW,
  }
  if (reviewId) row.last_review_id = reviewId
  return row
}

/** Payload for flipping a queue row to READY when the pipeline completes. */
export function buildReadyPatch(reviewId: string): TrackedPrReadyPatch {
  return {
    status: TrackedPrStatus.READY,
    last_review_id: reviewId,
  }
}

/** Payload for flipping a queue row to REVIEWED on finalize. */
export function buildReviewedPatch(reviewId: string): TrackedPrReviewedPatch {
  return {
    status: TrackedPrStatus.REVIEWED,
    last_review_id: reviewId,
  }
}

/** Queue patch when a live review fails. `review_count` is trigger-owned. */
export interface TrackedPrReviewFailedPatch {
  status: TrackedPrStatus.OPEN | TrackedPrStatus.REVIEWED
}

/**
 * Status after a pipeline error. Prior COMPLETE reviews keep REVIEWED;
 * a first-review failure returns to OPEN. Does not touch last_review_id.
 */
export function buildReviewFailedPatch(
  reviewCount: number
): TrackedPrReviewFailedPatch {
  return {
    status: reviewCount > 0 ? TrackedPrStatus.REVIEWED : TrackedPrStatus.OPEN,
  }
}

/**
 * Path to the last completed review for a queue row.
 *
 * IN_REVIEW is excluded: that last_review_id is the in-flight pipeline, and
 * opening it from the queue would re-enter GET /api/review/[id] as a live run.
 * READY/OPEN/CLOSED still link when a completed review exists.
 */
export function viewReviewHref(pr: {
  status: string
  last_review_id?: string | null
}): string | null {
  if (!pr.last_review_id) return null
  if (pr.status === TrackedPrStatus.IN_REVIEW) return null
  return `/review/${pr.last_review_id}`
}

/**
 * Path to the in-flight review. Null unless status is IN_REVIEW with an id.
 * Distinct from viewReviewHref so the running icon can open the live pipeline.
 */
export function inProgressReviewHref(pr: {
  status: string
  last_review_id?: string | null
}): string | null {
  if (pr.status !== TrackedPrStatus.IN_REVIEW) return null
  if (!pr.last_review_id) return null
  return `/review/${pr.last_review_id}`
}
