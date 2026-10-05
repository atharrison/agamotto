import {
  PR_FETCH_MESSAGES,
  PrFetchError,
  PrFetchFailure,
  classifyPrFetchFailure,
  prFetchFailureFromMessage,
} from '../src/lib/pr-fetch-error'

describe('classifyPrFetchFailure', () => {
  it('maps 401 to AUTH', () => {
    expect(classifyPrFetchFailure({ status: 401 })).toBe(PrFetchFailure.AUTH)
  })

  it('maps a plain 403 to AUTH', () => {
    expect(classifyPrFetchFailure({ status: 403 })).toBe(PrFetchFailure.AUTH)
  })

  it('maps a 403 with a rate-limit message to RATE_LIMITED', () => {
    const err = Object.assign(new Error('API rate limit exceeded'), {
      status: 403,
    })
    expect(classifyPrFetchFailure(err)).toBe(PrFetchFailure.RATE_LIMITED)
  })

  it('maps a 403 with x-ratelimit-remaining 0 to RATE_LIMITED', () => {
    expect(
      classifyPrFetchFailure({
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '0' } },
      })
    ).toBe(PrFetchFailure.RATE_LIMITED)
    expect(
      classifyPrFetchFailure({
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': 0 } },
      })
    ).toBe(PrFetchFailure.RATE_LIMITED)
  })

  it('keeps a 403 with remaining quota as AUTH', () => {
    expect(
      classifyPrFetchFailure({
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '42' } },
      })
    ).toBe(PrFetchFailure.AUTH)
  })

  it('maps 429 to RATE_LIMITED', () => {
    expect(classifyPrFetchFailure({ status: 429 })).toBe(
      PrFetchFailure.RATE_LIMITED
    )
  })

  it('maps 404 to NOT_FOUND', () => {
    expect(classifyPrFetchFailure({ status: 404 })).toBe(
      PrFetchFailure.NOT_FOUND
    )
  })

  it('maps 5xx, network errors, and non-objects to UNKNOWN', () => {
    expect(classifyPrFetchFailure({ status: 502 })).toBe(PrFetchFailure.UNKNOWN)
    expect(classifyPrFetchFailure(new Error('ECONNRESET'))).toBe(
      PrFetchFailure.UNKNOWN
    )
    expect(classifyPrFetchFailure(null)).toBe(PrFetchFailure.UNKNOWN)
    expect(classifyPrFetchFailure('boom')).toBe(PrFetchFailure.UNKNOWN)
    expect(classifyPrFetchFailure({ status: '401' })).toBe(
      PrFetchFailure.UNKNOWN
    )
  })
})

describe('PrFetchError', () => {
  it('carries the user-facing message and keeps the cause out of it', () => {
    const cause = new Error('Bad credentials')
    const err = new PrFetchError(PrFetchFailure.AUTH, cause)
    expect(err.name).toBe('PrFetchError')
    expect(err.failure).toBe(PrFetchFailure.AUTH)
    expect(err.detail).toBe(cause)
    expect(err.message).toBe(PR_FETCH_MESSAGES[PrFetchFailure.AUTH])
    expect(err.message).not.toContain('Bad credentials')
  })

  it('only the AUTH message tells the user to sign out and back in', () => {
    expect(PR_FETCH_MESSAGES[PrFetchFailure.AUTH]).toMatch(/sign out/i)
    for (const failure of [
      PrFetchFailure.NOT_FOUND,
      PrFetchFailure.RATE_LIMITED,
      PrFetchFailure.UNKNOWN,
    ]) {
      expect(PR_FETCH_MESSAGES[failure]).not.toMatch(/sign out/i)
    }
  })
})

describe('prFetchFailureFromMessage', () => {
  it('recovers each failure from a stored String(err)', () => {
    for (const failure of Object.values(PrFetchFailure)) {
      expect(prFetchFailureFromMessage(String(new PrFetchError(failure)))).toBe(
        failure
      )
    }
  })

  it('returns null for unrelated messages', () => {
    expect(prFetchFailureFromMessage('Error: boom')).toBeNull()
    expect(prFetchFailureFromMessage('')).toBeNull()
  })
})
