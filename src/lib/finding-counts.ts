/**
 * Finding-count extraction for history chips.
 * Counts array lengths on a stored `reviews.result` — no schema change.
 */

/** Finding severity. Matches `FindingSchema` and ReviewShell badges. */
export enum FindingSeverity {
  BLOCKING = 'BLOCKING',
  SUGGESTION = 'SUGGESTION',
  NIT = 'NIT',
}

/** Per-severity finding counts on one COMPLETE review. */
export interface FindingCounts {
  blocking: number
  suggestions: number
  nits: number
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

/**
 * Count blockers / suggestions / nits on a stored PRReview-shaped result.
 * Missing or non-array fields count as zero.
 */
export function findingCountsFromResult(result: unknown): FindingCounts {
  if (result == null || typeof result !== 'object') {
    return { blocking: 0, suggestions: 0, nits: 0 }
  }
  const rec = result as Record<string, unknown>
  return {
    blocking: arrayLength(rec.blockingIssues),
    suggestions: arrayLength(rec.suggestions),
    nits: arrayLength(rec.nits),
  }
}
