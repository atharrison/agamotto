import { TrackedPrStatus } from '../src/lib/tracked-prs'
import {
  STALE_CLOSED_AFTER_MS,
  isStaleClosed,
  withoutStaleClosed,
} from '../src/lib/stale-closed'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-08-29T18:00:00Z')

describe('isStaleClosed', () => {
  it('is false for non-CLOSED statuses', () => {
    expect(
      isStaleClosed(
        { status: TrackedPrStatus.OPEN, pr_closed_at: '2020-01-01T00:00:00Z' },
        NOW
      )
    ).toBe(false)
  })

  it('is false when closed less than 24 hours ago', () => {
    expect(
      isStaleClosed(
        {
          status: TrackedPrStatus.CLOSED,
          pr_closed_at: new Date(NOW - 2 * HOUR).toISOString(),
        },
        NOW
      )
    ).toBe(false)
  })

  it('is true when closed 24 hours ago or more', () => {
    expect(
      isStaleClosed(
        {
          status: TrackedPrStatus.CLOSED,
          pr_closed_at: new Date(NOW - STALE_CLOSED_AFTER_MS).toISOString(),
        },
        NOW
      )
    ).toBe(true)
  })

  it('falls back to updated_at when pr_closed_at is missing', () => {
    expect(
      isStaleClosed(
        {
          status: TrackedPrStatus.CLOSED,
          pr_closed_at: null,
          updated_at: new Date(NOW - STALE_CLOSED_AFTER_MS).toISOString(),
        },
        NOW
      )
    ).toBe(true)
  })

  it('treats an unparseable close timestamp as stale', () => {
    expect(
      isStaleClosed({
        status: TrackedPrStatus.CLOSED,
        pr_closed_at: 'not-a-date',
      })
    ).toBe(true)
  })
})

describe('withoutStaleClosed', () => {
  it('keeps recent closed and all open rows', () => {
    const open = { status: TrackedPrStatus.OPEN, id: 'a' }
    const recent = {
      status: TrackedPrStatus.CLOSED,
      id: 'b',
      pr_closed_at: new Date(NOW - HOUR).toISOString(),
    }
    const stale = {
      status: TrackedPrStatus.CLOSED,
      id: 'c',
      pr_closed_at: new Date(NOW - 2 * STALE_CLOSED_AFTER_MS).toISOString(),
    }
    expect(
      withoutStaleClosed([open, recent, stale], NOW).map(p => p.id)
    ).toEqual(['a', 'b'])
  })
})
