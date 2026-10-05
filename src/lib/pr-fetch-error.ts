/**
 * Fatal PR-fetch failures (ATH-61).
 *
 * The coordinator loads the PR diff straight from GitHub before any agent
 * runs. When that fetch fails the review stops here instead of limping on with
 * a "couldn't fetch the PR" preamble. Pure — no I/O, safe to import from client
 * components.
 */

/** Why the PR could not be fetched. Drives the user-facing message. */
export enum PrFetchFailure {
  /** No token, or GitHub rejected it (401 / non-rate-limit 403). */
  AUTH = 'AUTH',
  /** 404 — deleted PR, or a private repo this account cannot see. */
  NOT_FOUND = 'NOT_FOUND',
  /** 429, or a 403 that GitHub marks as a rate limit. */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Network failure, 5xx, or anything else we cannot classify. */
  UNKNOWN = 'UNKNOWN',
}

export const PR_FETCH_MESSAGES: Record<PrFetchFailure, string> = {
  [PrFetchFailure.AUTH]:
    'Your GitHub session has expired. Sign out and sign back in, then try again.',
  [PrFetchFailure.NOT_FOUND]:
    "GitHub couldn't find this PR. It may have been deleted, or your account may not have access to the repository.",
  [PrFetchFailure.RATE_LIMITED]:
    'GitHub rate limit reached while fetching the PR. Wait a few minutes, then try again.',
  [PrFetchFailure.UNKNOWN]:
    "Couldn't fetch the PR from GitHub. Try again in a moment; check server logs if it keeps happening.",
}

export class PrFetchError extends Error {
  constructor(
    public readonly failure: PrFetchFailure,
    /** The underlying error, kept for logs. Never shown to the user. */
    public readonly detail?: unknown
  ) {
    super(PR_FETCH_MESSAGES[failure])
    this.name = 'PrFetchError'
  }

  /**
   * Stored verbatim in `reviews.error_message` via `String(err)`. Leads with
   * the stable failure code so View Review can recover it even after the
   * user-facing copy is reworded.
   */
  override toString(): string {
    return `${this.name}[${this.failure}]: ${this.message}`
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

/** GitHub signals a rate-limited 403 via the message or an exhausted quota header. */
function isRateLimit403(err: Record<string, unknown>): boolean {
  if (err instanceof Error && /rate limit/i.test(err.message)) return true
  const headers = asRecord(asRecord(err.response)?.headers)
  return String(headers?.['x-ratelimit-remaining']) === '0'
}

/** Map an Octokit / network error to a PrFetchFailure. */
export function classifyPrFetchFailure(err: unknown): PrFetchFailure {
  const rec = asRecord(err)
  const status = rec?.status
  if (!rec || typeof status !== 'number') return PrFetchFailure.UNKNOWN
  if (status === 401) return PrFetchFailure.AUTH
  if (status === 403) {
    return isRateLimit403(rec)
      ? PrFetchFailure.RATE_LIMITED
      : PrFetchFailure.AUTH
  }
  if (status === 429) return PrFetchFailure.RATE_LIMITED
  if (status === 404) return PrFetchFailure.NOT_FOUND
  return PrFetchFailure.UNKNOWN
}

const STORED_FAILURE_CODE = /^PrFetchError\[([A-Z_]+)\]:/

/**
 * Recover the failure from a stored `reviews.error_message`
 * (`String(err)` of a PrFetchError). Reads the code, not the copy, so View
 * Review shows the current message even if the wording changes later.
 */
export function prFetchFailureFromMessage(
  message: string
): PrFetchFailure | null {
  const code = STORED_FAILURE_CODE.exec(message)?.[1]
  return Object.values(PrFetchFailure).find(f => f === code) ?? null
}
