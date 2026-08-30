import { findingCountsFromResult } from '../src/lib/finding-counts'

describe('findingCountsFromResult', () => {
  it('counts blocking, suggestion, and nit arrays', () => {
    expect(
      findingCountsFromResult({
        blockingIssues: [{}, {}],
        suggestions: [{}],
        nits: [{}, {}, {}],
      })
    ).toEqual({ blocking: 2, suggestions: 1, nits: 3 })
  })

  it('treats missing arrays as zero', () => {
    expect(findingCountsFromResult({})).toEqual({
      blocking: 0,
      suggestions: 0,
      nits: 0,
    })
  })

  it('returns zeros when result is not an object', () => {
    expect(findingCountsFromResult(null)).toEqual({
      blocking: 0,
      suggestions: 0,
      nits: 0,
    })
    expect(findingCountsFromResult(undefined)).toEqual({
      blocking: 0,
      suggestions: 0,
      nits: 0,
    })
    expect(findingCountsFromResult('nope')).toEqual({
      blocking: 0,
      suggestions: 0,
      nits: 0,
    })
  })

  it('treats non-array finding fields as zero', () => {
    expect(
      findingCountsFromResult({
        blockingIssues: 4,
        suggestions: 'x',
        nits: { length: 9 },
      })
    ).toEqual({ blocking: 0, suggestions: 0, nits: 0 })
  })
})
