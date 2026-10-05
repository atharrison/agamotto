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
}

function numberProp(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const prop = (value as Record<string, unknown>)[key]
  return typeof prop === 'number' ? prop : undefined
}

/** GitHub signals a rate-limited 403 via the message or an exhausted quota header. */
function isRateLimit403(err: object): boolean {
  if (err instanceof Error && /rate limit/i.test(err.message)) return true
  const { response } = err as { response?: { headers?: unknown } }
  const headers = response?.headers
  if (!headers || typeof headers !== 'object') return false
  const remaining = (headers as Record<string, unknown>)[
    'x-ratelimit-remaining'
  ]
  return String(remaining) === '0'
}

/** Map an Octokit / network error to a PrFetchFailure. */
export function classifyPrFetchFailure(err: unknown): PrFetchFailure {
  const status = numberProp(err, 'status')
  if (status === 401) return PrFetchFailure.AUTH
  if (status === 403) {
    // status is a number, so err is a non-null object here
    return isRateLimit403(err as object)
      ? PrFetchFailure.RATE_LIMITED
      : PrFetchFailure.AUTH
  }
  if (status === 429) return PrFetchFailure.RATE_LIMITED
  if (status === 404) return PrFetchFailure.NOT_FOUND
  return PrFetchFailure.UNKNOWN
}

/**
 * Recover the failure from a stored `reviews.error_message`
 * (`String(err)` of a PrFetchError) so View Review shows the same copy.
 */
export function prFetchFailureFromMessage(
  message: string
): PrFetchFailure | null {
  for (const failure of Object.values(PrFetchFailure)) {
    if (message.includes(PR_FETCH_MESSAGES[failure])) return failure
  }
  return null
}
