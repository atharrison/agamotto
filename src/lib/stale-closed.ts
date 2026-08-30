/**
 * Queue inbox: hide CLOSED PRs that have been closed longer than 24 hours.
 */

import { TrackedPrStatus } from './tracked-prs'

export const STALE_CLOSED_AFTER_MS = 24 * 60 * 60 * 1000

/** True when a queue row is CLOSED and its close time is ≥ 24 hours ago. */
export function isStaleClosed(
  pr: {
    status: string
    pr_closed_at?: string | null
    updated_at?: string | null
  },
  nowMs: number = Date.now()
): boolean {
  if (pr.status !== TrackedPrStatus.CLOSED) return false
  const closedAt = pr.pr_closed_at ?? pr.updated_at
  if (!closedAt) return true
  const closedMs = Date.parse(closedAt)
  if (Number.isNaN(closedMs)) return true
  return nowMs - closedMs >= STALE_CLOSED_AFTER_MS
}

/** Drop stale-closed rows from a queue list. */
export function withoutStaleClosed<
  T extends {
    status: string
    pr_closed_at?: string | null
    updated_at?: string | null
  },
>(prs: T[], nowMs: number = Date.now()): T[] {
  return prs.filter(pr => !isStaleClosed(pr, nowMs))
}
