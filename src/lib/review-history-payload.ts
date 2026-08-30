/**
 * Extract searchable summary + finding count from whatever finalize
 * (or a tool) passed to storeReview.
 *
 * Finalize wraps the PRReview as `{ review, submission }`. A bare review
 * object (tests, store_review tool) is also accepted.
 */

export interface ReviewHistoryFields {
  summary: string
  findingCount: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function countFindings(inner: Record<string, unknown>): number {
  if (Array.isArray(inner.findings)) return inner.findings.length
  let count = 0
  for (const bucket of [inner.blockingIssues, inner.suggestions, inner.nits]) {
    if (Array.isArray(bucket)) count += bucket.length
  }
  return count
}

/** Summary text and finding count for a review_history row. */
export function reviewHistoryFields(review: unknown): ReviewHistoryFields {
  const obj = asRecord(review)
  if (!obj) return { summary: '', findingCount: 0 }

  const nested = asRecord(obj.review)
  const inner = nested ?? obj
  const summary = typeof inner.summary === 'string' ? inner.summary : ''
  return { summary, findingCount: countFindings(inner) }
}
