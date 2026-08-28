/**
 * Decide whether GET /api/review/[id] should replay a stored result, run the
 * pipeline, or error. Pure — no I/O.
 *
 * ATH-30: a View Review link from the queue is `/review/{id}` with no
 * ?prUrl=. COMPLETE rows must still replay from the reviews table.
 */

export enum ReviewStreamKind {
  REPLAY = 'REPLAY',
  RUN = 'RUN',
  ERROR = 'ERROR',
}

export enum StoredReviewStatus {
  RUNNING = 'RUNNING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export interface StoredReviewRef {
  status: string
  pr_url: string
  result: unknown
}

export type ReviewStreamDecision =
  | { kind: ReviewStreamKind.REPLAY; prUrl: string }
  | { kind: ReviewStreamKind.RUN; prUrl: string }
  | { kind: ReviewStreamKind.ERROR; error: string; prUrl?: undefined }

const FAILED_REVIEW_ERROR = 'Review failed. Check server logs for details.'
const MISSING_PR_URL_ERROR = 'prUrl query param is required'

export function resolveReviewStream(opts: {
  queryPrUrl: string
  stored: StoredReviewRef | null
}): ReviewStreamDecision {
  const storedPrUrl = opts.stored?.pr_url ?? ''
  const prUrl = opts.queryPrUrl || storedPrUrl

  if (
    opts.stored?.status === StoredReviewStatus.COMPLETE &&
    opts.stored.result
  ) {
    return { kind: ReviewStreamKind.REPLAY, prUrl }
  }

  if (opts.stored?.status === StoredReviewStatus.ERROR) {
    return { kind: ReviewStreamKind.ERROR, error: FAILED_REVIEW_ERROR }
  }

  if (!prUrl) {
    return { kind: ReviewStreamKind.ERROR, error: MISSING_PR_URL_ERROR }
  }

  return { kind: ReviewStreamKind.RUN, prUrl }
}
