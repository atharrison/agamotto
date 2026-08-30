/**
 * Relative bar widths for history finding-count tracks.
 *
 * Mix encoding within one chip: length = count / max(B, S, N).
 * Magnitude is the integer labels, not the bars.
 */

import type { FindingCounts } from './finding-counts'

/** Floor for a non-zero count so a 1 next to a large max stays visible. */
export const MIN_VISIBLE_TRACK_FRACTION = 0.08

/** 0–1 widths for the three severity tracks. Zero count stays 0. */
export interface FindingCountTrackWidths {
  blocking: number
  suggestions: number
  nits: number
}

function fraction(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return Math.max(count / max, MIN_VISIBLE_TRACK_FRACTION)
}

/**
 * Bar widths relative to the largest of the three counts on this chip.
 * 4/2/1 and 8/4/2 are identical; 8/4/1 is not the same mix as 4/2/1.
 */
export function findingCountTrackWidths(
  counts: FindingCounts
): FindingCountTrackWidths {
  const max = Math.max(counts.blocking, counts.suggestions, counts.nits)
  return {
    blocking: fraction(counts.blocking, max),
    suggestions: fraction(counts.suggestions, max),
    nits: fraction(counts.nits, max),
  }
}
