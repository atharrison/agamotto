/**
 * Prev/next among complete reviews for the same PR.
 * `ids` must be oldest → newest.
 */

export interface SiblingReviewNav {
  position: number
  total: number
  olderId: string | null
  newerId: string | null
}

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
