import {
  CONFIDENCE_EMPTY_SEGMENT,
  ConfidenceVariant,
  DEFAULT_CONFIDENCE_VARIANT,
  formatConfidencePercent,
  getConfidenceTier,
} from '../src/lib/confidence-bar'

describe('getConfidenceTier', () => {
  it('fills 0 bars below 20%', () => {
    expect(getConfidenceTier(0)).toEqual({ bars: 0, color: '#6b7280' })
    expect(getConfidenceTier(0.199)).toEqual({ bars: 0, color: '#6b7280' })
  })

  it('fills 1 bar from 20% up to 40%', () => {
    expect(getConfidenceTier(0.2)).toEqual({ bars: 1, color: '#b91c1c' })
    expect(getConfidenceTier(0.399)).toEqual({ bars: 1, color: '#b91c1c' })
  })

  it('fills 2 bars from 40% up to 60%', () => {
    expect(getConfidenceTier(0.4)).toEqual({ bars: 2, color: '#c2410c' })
    expect(getConfidenceTier(0.599)).toEqual({ bars: 2, color: '#c2410c' })
  })

  it('fills 3 bars from 60% up to 80%', () => {
    expect(getConfidenceTier(0.6)).toEqual({ bars: 3, color: '#ca8a04' })
    expect(getConfidenceTier(0.799)).toEqual({ bars: 3, color: '#ca8a04' })
  })

  it('fills 4 bars from 80% up to 90%', () => {
    expect(getConfidenceTier(0.8)).toEqual({ bars: 4, color: '#15803d' })
    expect(getConfidenceTier(0.899)).toEqual({ bars: 4, color: '#15803d' })
  })

  it('fills 5 bars from 90% through 100%', () => {
    expect(getConfidenceTier(0.9)).toEqual({ bars: 5, color: '#16a34a' })
    expect(getConfidenceTier(1)).toEqual({ bars: 5, color: '#16a34a' })
  })
})

describe('formatConfidencePercent', () => {
  it('rounds to a whole-number percent string', () => {
    expect(formatConfidencePercent(0)).toBe('0%')
    expect(formatConfidencePercent(0.72)).toBe('72%')
    expect(formatConfidencePercent(0.995)).toBe('100%')
    expect(formatConfidencePercent(1)).toBe('100%')
  })
})

describe('CONFIDENCE_EMPTY_SEGMENT', () => {
  it('matches the empty finding-count track fill', () => {
    expect(CONFIDENCE_EMPTY_SEGMENT).toBe('#374151')
  })
})

describe('ConfidenceVariant', () => {
  it('uses UPPER_CASE string values and defaults to Option D', () => {
    expect(ConfidenceVariant.SEGMENTED_TRACK).toBe('SEGMENTED_TRACK')
    expect(ConfidenceVariant.PILL_BARS).toBe('PILL_BARS')
    expect(ConfidenceVariant.SIGNAL_BARS).toBe('SIGNAL_BARS')
    expect(ConfidenceVariant.DOT_ROW).toBe('DOT_ROW')
    expect(DEFAULT_CONFIDENCE_VARIANT).toBe(ConfidenceVariant.SEGMENTED_TRACK)
  })
})
