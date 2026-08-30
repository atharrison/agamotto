import {
  DEFAULT_HISTORY_FILTERS,
  HISTORY_FILTER_COOKIE_MAX_AGE,
  HISTORY_FILTER_ON,
  HistoryFilterCookie,
  historyFilterSetCookie,
  historyFiltersFromCookieValues,
} from '../src/lib/history-filters'

describe('HistoryFilterCookie', () => {
  it('uses UPPER_CASE cookie names', () => {
    expect(HistoryFilterCookie.CLOSED).toBe('AGAMOTTO_HISTORY_CLOSED')
    expect(HistoryFilterCookie.REVIEWED).toBe('AGAMOTTO_HISTORY_REVIEWED')
  })
})

describe('historyFiltersFromCookieValues', () => {
  it('defaults both checkboxes off when cookies are missing', () => {
    expect(historyFiltersFromCookieValues({})).toEqual(DEFAULT_HISTORY_FILTERS)
  })

  it('turns a checkbox on only when the value is 1', () => {
    expect(
      historyFiltersFromCookieValues({
        closed: HISTORY_FILTER_ON,
        reviewed: HISTORY_FILTER_ON,
      })
    ).toEqual({ includeClosed: true, reviewedOnly: true })
  })

  it('treats any other value as off', () => {
    expect(
      historyFiltersFromCookieValues({ closed: '0', reviewed: 'yes' })
    ).toEqual(DEFAULT_HISTORY_FILTERS)
  })
})

describe('historyFilterSetCookie', () => {
  it('sets a session-stable on cookie', () => {
    expect(historyFilterSetCookie(HistoryFilterCookie.CLOSED, true)).toBe(
      `${HistoryFilterCookie.CLOSED}=${HISTORY_FILTER_ON}; Path=/; Max-Age=${HISTORY_FILTER_COOKIE_MAX_AGE}; SameSite=Lax`
    )
  })

  it('clears the cookie when the checkbox is off', () => {
    expect(historyFilterSetCookie(HistoryFilterCookie.REVIEWED, false)).toBe(
      `${HistoryFilterCookie.REVIEWED}=; Path=/; Max-Age=0; SameSite=Lax`
    )
  })
})
