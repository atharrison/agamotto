/**
 * Service-role writes that keep `tracked_prs` in sync with the review lifecycle.
 *
 * `review_count` is incremented by the `tracked_prs_on_reviewed` trigger —
 * these helpers never write that column.
 */

import { createSupabaseServiceRoleClient } from '../lib/supabase/server'
import type { ParsedPrUrl } from '../lib/queue'
import {
  TrackedPrStatus,
  buildInReviewUpsert,
  buildReadyPatch,
  buildReviewedPatch,
  buildReviewFailedPatch,
} from '../lib/tracked-prs'
import type { TrackedPrHistoryRow } from '../lib/history-prs'
import { ReviewStatus } from './review-store'

/** Upsert the queue row to IN_REVIEW and record last_review_id.
 *
 * No prior-status guard: a user-triggered start is a re-review, including
 * CLOSED → IN_REVIEW. REVIEWED → IN_REVIEW is the ATH-15 acceptance path.
 */
export async function markPrInReview(
  parsed: ParsedPrUrl,
  reviewId: string | null
): Promise<void> {
  const { error } = await createSupabaseServiceRoleClient()
    .from('tracked_prs')
    .upsert(buildInReviewUpsert(parsed, reviewId), {
      onConflict: 'owner,repo,pr_number',
    })
  if (error) throw new Error(`markPrInReview failed: ${error.message}`)
}

/**
 * Flip IN_REVIEW → READY after the pipeline writes COMPLETE.
 * No-op when the row is missing or no longer IN_REVIEW (close webhook, finalize).
 * Does not increment `review_count` — that trigger is REVIEWED-only.
 */
export async function markPrReady(
  parsed: ParsedPrUrl,
  reviewId: string
): Promise<void> {
  const { error } = await createSupabaseServiceRoleClient()
    .from('tracked_prs')
    .update(buildReadyPatch(reviewId))
    .eq('owner', parsed.owner)
    .eq('repo', parsed.repo)
    .eq('pr_number', parsed.pr_number)
    .eq('status', TrackedPrStatus.IN_REVIEW)
  if (error) throw new Error(`markPrReady failed: ${error.message}`)
}

/** Flip an existing queue row to REVIEWED. No-op if the row does not exist. */
export async function markPrReviewed(
  parsed: ParsedPrUrl,
  reviewId: string
): Promise<void> {
  const { error } = await createSupabaseServiceRoleClient()
    .from('tracked_prs')
    .update(buildReviewedPatch(reviewId))
    .eq('owner', parsed.owner)
    .eq('repo', parsed.repo)
    .eq('pr_number', parsed.pr_number)
  if (error) throw new Error(`markPrReviewed failed: ${error.message}`)
}

/**
 * Clear IN_REVIEW after a pipeline error. REVIEWED if this PR already had a
 * completed review; otherwise OPEN. No-op when the row is missing or not
 * IN_REVIEW (e.g. a close webhook won).
 */
export async function markPrReviewFailed(parsed: ParsedPrUrl): Promise<void> {
  const supabase = createSupabaseServiceRoleClient()
  const { data, error: readError } = await supabase
    .from('tracked_prs')
    .select('review_count, status')
    .eq('owner', parsed.owner)
    .eq('repo', parsed.repo)
    .eq('pr_number', parsed.pr_number)
    .single()
  if (readError) {
    if (
      typeof readError === 'object' &&
      readError !== null &&
      'code' in readError &&
      readError.code === 'PGRST116'
    ) {
      return
    }
    throw new Error(`markPrReviewFailed failed: ${readError.message}`)
  }
  if (!data) return
  if (data.status !== TrackedPrStatus.IN_REVIEW) return
  const { error } = await supabase
    .from('tracked_prs')
    .update(buildReviewFailedPatch(data.review_count ?? 0))
    .eq('owner', parsed.owner)
    .eq('repo', parsed.repo)
    .eq('pr_number', parsed.pr_number)
    .eq('status', TrackedPrStatus.IN_REVIEW)
  if (error) throw new Error(`markPrReviewFailed failed: ${error.message}`)
}

/** IN_REVIEW row that may be stuck after a failed pipeline. */
interface StuckInReviewRow {
  owner: string
  repo: string
  pr_number: number
  last_review_id: string | null
  review_count: number | null
}

/**
 * Clear queue/history spinners when last_review_id already points at a
 * finished review. ERROR → failed patch; COMPLETE → READY. Live IN_REVIEW +
 * RUNNING rows are left alone.
 */
export async function healStuckInReviewRows(): Promise<void> {
  const supabase = createSupabaseServiceRoleClient()
  const { data, error: listError } = await supabase
    .from('tracked_prs')
    .select('owner, repo, pr_number, last_review_id, review_count')
    .eq('status', TrackedPrStatus.IN_REVIEW)
    .not('last_review_id', 'is', null)
  if (listError) {
    throw new Error(`healStuckInReviewRows failed: ${listError.message}`)
  }
  const stuck = (data ?? []) as StuckInReviewRow[]
  const ids = stuck
    .map(row => row.last_review_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (ids.length === 0) return

  const { data: finished, error: revError } = await supabase
    .from('reviews')
    .select('id, status')
    .in('id', ids)
    .in('status', [ReviewStatus.ERROR, ReviewStatus.COMPLETE])
  if (revError) {
    throw new Error(`healStuckInReviewRows failed: ${revError.message}`)
  }
  const statusById = new Map(
    (finished ?? []).map(row => [row.id as string, row.status as string])
  )
  for (const row of stuck) {
    if (!row.last_review_id) continue
    const reviewStatus = statusById.get(row.last_review_id)
    if (!reviewStatus) continue
    const parsed: ParsedPrUrl = {
      owner: row.owner,
      repo: row.repo,
      pr_number: row.pr_number,
      canonical_url: `https://github.com/${row.owner}/${row.repo}/pull/${row.pr_number}`,
    }
    if (reviewStatus === ReviewStatus.ERROR) {
      await markPrReviewFailed(parsed)
    } else if (reviewStatus === ReviewStatus.COMPLETE) {
      await markPrReady(parsed, row.last_review_id)
    }
  }
}

/** Queue metadata for history PR bars. Empty `urls` skips the query. */
export async function listTrackedPrsByUrls(
  urls: string[]
): Promise<TrackedPrHistoryRow[]> {
  if (urls.length === 0) return []
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('tracked_prs')
    .select('pr_url, pr_title, pr_author, status, last_review_id')
    .in('pr_url', urls)
  if (error) throw new Error(`listTrackedPrsByUrls failed: ${error.message}`)
  return (data ?? []) as TrackedPrHistoryRow[]
}
