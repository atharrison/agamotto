import { parsePrUrl } from '../src/lib/queue'
import {
  TrackedPrStatus,
  TRACKED_PR_STATUS_VALUES,
  SYNC_INVALIDATES_STATUSES,
  isTrackedPrStatus,
  buildInReviewUpsert,
  buildReadyPatch,
  buildReviewedPatch,
  buildReviewFailedPatch,
  viewReviewHref,
  inProgressReviewHref,
} from '../src/lib/tracked-prs'

const parsed = parsePrUrl('https://github.com/acme/app/pull/42')!

describe('TrackedPrStatus', () => {
  it('uses UPPER_CASE string values', () => {
    expect(TrackedPrStatus.OPEN).toBe('OPEN')
    expect(TrackedPrStatus.IN_REVIEW).toBe('IN_REVIEW')
    expect(TrackedPrStatus.READY).toBe('READY')
    expect(TrackedPrStatus.REVIEWED).toBe('REVIEWED')
    expect(TrackedPrStatus.CLOSED).toBe('CLOSED')
    expect(TRACKED_PR_STATUS_VALUES).toEqual([
      'OPEN',
      'IN_REVIEW',
      'READY',
      'REVIEWED',
      'CLOSED',
    ])
    expect(SYNC_INVALIDATES_STATUSES).toEqual([
      TrackedPrStatus.REVIEWED,
      TrackedPrStatus.READY,
    ])
    expect(isTrackedPrStatus('READY')).toBe(true)
    expect(isTrackedPrStatus('BOGUS')).toBe(false)
  })
})

describe('buildInReviewUpsert', () => {
  it('sets IN_REVIEW and last_review_id from the parsed URL', () => {
    expect(buildInReviewUpsert(parsed, 'rev-1')).toEqual({
      owner: 'acme',
      repo: 'app',
      pr_number: 42,
      pr_url: 'https://github.com/acme/app/pull/42',
      status: TrackedPrStatus.IN_REVIEW,
      last_review_id: 'rev-1',
    })
  })

  it('does not include review_count (owned by the DB trigger)', () => {
    expect(buildInReviewUpsert(parsed, 'rev-1')).not.toHaveProperty(
      'review_count'
    )
  })

  it('omits last_review_id when the reviews row was not created', () => {
    expect(buildInReviewUpsert(parsed, null)).not.toHaveProperty(
      'last_review_id'
    )
    expect(buildInReviewUpsert(parsed, null).status).toBe(
      TrackedPrStatus.IN_REVIEW
    )
  })

  it('always sets IN_REVIEW with no prior-status field (CLOSED is overwritten)', () => {
    const row = buildInReviewUpsert(parsed, 'rev-1')
    expect(row.status).toBe(TrackedPrStatus.IN_REVIEW)
    expect(Object.keys(row)).not.toContain('prior_status')
  })
})

describe('buildReadyPatch', () => {
  it('sets READY and last_review_id without touching review_count', () => {
    const patch = buildReadyPatch('rev-9')
    expect(patch).toEqual({
      status: TrackedPrStatus.READY,
      last_review_id: 'rev-9',
    })
    expect(patch).not.toHaveProperty('review_count')
  })
})

describe('buildReviewedPatch', () => {
  it('sets REVIEWED and last_review_id without touching review_count', () => {
    const patch = buildReviewedPatch('rev-9')
    expect(patch).toEqual({
      status: TrackedPrStatus.REVIEWED,
      last_review_id: 'rev-9',
    })
    expect(patch).not.toHaveProperty('review_count')
  })
})

describe('buildReviewFailedPatch', () => {
  it('returns OPEN when there were no completed reviews', () => {
    expect(buildReviewFailedPatch(0)).toEqual({ status: TrackedPrStatus.OPEN })
  })

  it('returns REVIEWED when a prior review completed', () => {
    expect(buildReviewFailedPatch(2)).toEqual({
      status: TrackedPrStatus.REVIEWED,
    })
  })

  it('does not include review_count or last_review_id', () => {
    const patch = buildReviewFailedPatch(1)
    expect(patch).not.toHaveProperty('review_count')
    expect(patch).not.toHaveProperty('last_review_id')
  })
})

describe('viewReviewHref', () => {
  const reviewId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  it('returns /review/{id} for a REVIEWED row with last_review_id', () => {
    expect(
      viewReviewHref({
        status: TrackedPrStatus.REVIEWED,
        last_review_id: reviewId,
      })
    ).toBe(`/review/${reviewId}`)
  })

  it('returns /review/{id} for a CLOSED row that still has last_review_id', () => {
    expect(
      viewReviewHref({
        status: TrackedPrStatus.CLOSED,
        last_review_id: reviewId,
      })
    ).toBe(`/review/${reviewId}`)
  })

  it('returns /review/{id} for OPEN + last_review_id (updated after review)', () => {
    expect(
      viewReviewHref({
        status: TrackedPrStatus.OPEN,
        last_review_id: reviewId,
      })
    ).toBe(`/review/${reviewId}`)
  })

  it('returns /review/{id} for READY so the COMPLETE run is not treated as live', () => {
    expect(
      viewReviewHref({
        status: TrackedPrStatus.READY,
        last_review_id: reviewId,
      })
    ).toBe(`/review/${reviewId}`)
  })

  it('returns null when last_review_id is missing', () => {
    expect(
      viewReviewHref({
        status: TrackedPrStatus.REVIEWED,
        last_review_id: null,
      })
    ).toBeNull()
  })

  it('returns null for IN_REVIEW so the live pipeline is not re-entered from the queue', () => {
    expect(
      viewReviewHref({
        status: TrackedPrStatus.IN_REVIEW,
        last_review_id: reviewId,
      })
    ).toBeNull()
  })
})

describe('inProgressReviewHref', () => {
  const reviewId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  it('returns /review/{id} for IN_REVIEW with last_review_id', () => {
    expect(
      inProgressReviewHref({
        status: TrackedPrStatus.IN_REVIEW,
        last_review_id: reviewId,
      })
    ).toBe(`/review/${reviewId}`)
  })

  it('returns null when IN_REVIEW has no last_review_id', () => {
    expect(
      inProgressReviewHref({
        status: TrackedPrStatus.IN_REVIEW,
        last_review_id: null,
      })
    ).toBeNull()
  })

  it('returns null for REVIEWED (use viewReviewHref instead)', () => {
    expect(
      inProgressReviewHref({
        status: TrackedPrStatus.REVIEWED,
        last_review_id: reviewId,
      })
    ).toBeNull()
  })

  it('returns null for READY (pipeline is done; spinner must stop)', () => {
    expect(
      inProgressReviewHref({
        status: TrackedPrStatus.READY,
        last_review_id: reviewId,
      })
    ).toBeNull()
  })
})
