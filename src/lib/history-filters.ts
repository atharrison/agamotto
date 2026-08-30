/** History Closed / Reviewed-only checkboxes. Client-written, SSR-read. */

export enum HistoryFilterCookie {
  CLOSED = 'AGAMOTTO_HISTORY_CLOSED',
  REVIEWED = 'AGAMOTTO_HISTORY_REVIEWED',
}

/** Cookie value stored when a checkbox is on. */
export const HISTORY_FILTER_ON = '1'

/** 30 days — returning from Queue, Settings, or a review keeps the checks. */
export const HISTORY_FILTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export interface HistoryFilterState {
  includeClosed: boolean
  reviewedOnly: boolean
}

export const DEFAULT_HISTORY_FILTERS: HistoryFilterState = {
  includeClosed: false,
  reviewedOnly: false,
}

/** Missing or non-`1` cookie values mean the checkbox is off (the default). */
export function historyFiltersFromCookieValues(values: {
  closed?: string
  reviewed?: string
}): HistoryFilterState {
  return {
    includeClosed: values.closed === HISTORY_FILTER_ON,
    reviewedOnly: values.reviewed === HISTORY_FILTER_ON,
  }
}

/** `document.cookie` assignment for one History filter checkbox. */
export function historyFilterSetCookie(
  name: HistoryFilterCookie,
  on: boolean
): string {
  if (!on) {
    return `${name}=; Path=/; Max-Age=0; SameSite=Lax`
  }
  return `${name}=${HISTORY_FILTER_ON}; Path=/; Max-Age=${HISTORY_FILTER_COOKIE_MAX_AGE}; SameSite=Lax`
}
