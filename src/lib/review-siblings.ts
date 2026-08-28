/**
 * Prev/next among complete reviews for the same PR.
 * `ids` must be oldest → newest.
 *
 * Pure — callers load ids with a single `listCompleteReviewIdsForPr` query
 * (review page only, not per queue row).
 */

/** Pager model for the Reviews sidebar block. Null from siblingReviewNav when total < 2. */
export interface SiblingReviewNav {
  position: number
  total: number
  olderId: string | null
  newerId: string | null
}

/**
 * Build Older/Newer navigation for the current review among a PR's complete ids.
 * Returns null when there is nothing to page (fewer than two ids, or current not in the list).
 */
export function siblingReviewNav(
  ids: string[],
  currentId: string
): SiblingReviewNav | null {
  if (ids.length < 2) return null
  const index = ids.indexOf(currentId)
  if (index < 0) return null
  return {
    position: index + 1,
    total: ids.length,
    olderId: index > 0 ? ids[index - 1] : null,
    newerId: index < ids.length - 1 ? ids[index + 1] : null,
  }
}
