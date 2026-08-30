/**
 * Live and replayed review-run stats, including token-budget overage.
 * Pure — no I/O. TokenBudgetError is detected by name + fields so this
 * module stays out of the harness layer.
 */

/** Duck-typed TokenBudgetError fields used for SSE stats and copy. */
export interface TokenBudgetOverage {
  tokensUsed: number
  maxTokens: number
  cost: number
}

/** Payload for the SSE `stats` event (success and token-budget failure). */
export interface ReviewRunStatsPayload {
  tokensUsed: number
  estimatedCostUsd?: number
  durationMs?: number
  findingsCount: number
  phaseDurations: Record<string, number>
  maxTokens?: number
}

const TOKEN_BUDGET_MESSAGE = /Token budget exceeded:\s*(\d+)\s*>\s*(\d+)/

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

/** Pull tokens/limit/cost off a TokenBudgetError (live catch). */
export function tokenBudgetOverageFromError(
  err: unknown
): TokenBudgetOverage | null {
  if (typeof err !== 'object' || err === null) return null
  const rec = err as Record<string, unknown>
  if (rec.name !== 'TokenBudgetError') return null
  if (typeof rec.tokensUsed !== 'number' || typeof rec.maxTokens !== 'number') {
    return null
  }
  return {
    tokensUsed: rec.tokensUsed,
    maxTokens: rec.maxTokens,
    cost: typeof rec.cost === 'number' ? rec.cost : 0,
  }
}

/** Parse `Token budget exceeded: N > M` from a stored reviews.error_message. */
export function tokenBudgetOverageFromMessage(
  message: string
): TokenBudgetOverage | null {
  const m = TOKEN_BUDGET_MESSAGE.exec(message)
  if (!m) return null
  return {
    tokensUsed: Number(m[1]),
    maxTokens: Number(m[2]),
    cost: 0,
  }
}

/** Stats event for a token-budget failure. Omit cost/duration when unknown. */
export function tokenBudgetStats(
  overage: TokenBudgetOverage,
  extras?: { durationMs?: number; includeCost?: boolean }
): ReviewRunStatsPayload {
  const payload: ReviewRunStatsPayload = {
    tokensUsed: overage.tokensUsed,
    maxTokens: overage.maxTokens,
    findingsCount: 0,
    phaseDurations: {},
  }
  if (extras?.includeCost) {
    payload.estimatedCostUsd = Math.round(overage.cost * 10000) / 10000
  }
  if (extras?.durationMs != null) {
    payload.durationMs = extras.durationMs
  }
  return payload
}

/** User-facing pipeline error copy. Token budget includes the overage. */
export function pipelineFailureErrorMessage(err: unknown): string {
  const overage = tokenBudgetOverageFromError(err)
  if (overage) return tokenBudgetErrorMessage(overage)
  return 'Review pipeline failed. Check server logs for details.'
}

/** Activity-log / SSE error text for a known overage. */
export function tokenBudgetErrorMessage(overage: TokenBudgetOverage): string {
  const used = formatCount(overage.tokensUsed)
  const limit = formatCount(overage.maxTokens)
  const over = formatCount(Math.max(0, overage.tokensUsed - overage.maxTokens))
  return `Token budget exceeded: ${used} used of ${limit} (over by ${over}).`
}

/**
 * Sidebar token line. Includes `/ limit` and overage when a budget is known.
 */
export function formatTokenUsage(
  tokensUsed: number,
  maxTokens?: number
): string {
  const used = formatCount(tokensUsed)
  if (maxTokens == null) return `${used} tokens`
  const limit = formatCount(maxTokens)
  if (tokensUsed > maxTokens) {
    const over = formatCount(tokensUsed - maxTokens)
    return `${used} / ${limit} tokens (over by ${over})`
  }
  return `${used} / ${limit} tokens`
}
