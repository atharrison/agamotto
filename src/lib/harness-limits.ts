/**
 * Agent-loop hard stops from env (MAX_TURNS, MAX_TOKENS, TIMEOUT_MS).
 * Read at call time so .env / Railway vars are respected without a Settings UI.
 */

export const DEFAULT_MAX_TURNS = 20
export const DEFAULT_MAX_TOKENS = 200_000
export const DEFAULT_TIMEOUT_MS = 300_000

/** Hard stops applied when a `run()` caller omits LoopConfig overrides. */
export interface HarnessLimits {
  maxTurns: number
  maxTokens: number
  timeoutMs: number
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n <= 0) return fallback
  return n
}

/**
 * Parse loop limits from an env bag. Invalid, missing, or non-positive values
 * fall back to the documented .env.example defaults.
 */
export function harnessLimits(
  env: Record<string, string | undefined> = process.env
): HarnessLimits {
  return {
    maxTurns: parsePositiveInt(env.MAX_TURNS, DEFAULT_MAX_TURNS),
    maxTokens: parsePositiveInt(env.MAX_TOKENS, DEFAULT_MAX_TOKENS),
    timeoutMs: parsePositiveInt(env.TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  }
}
