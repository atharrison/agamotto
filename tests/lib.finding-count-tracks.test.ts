import { findingCountTrackWidths } from '../src/lib/finding-count-tracks'
import { MIN_VISIBLE_TRACK_FRACTION } from '../src/lib/finding-count-tracks'

describe('findingCountTrackWidths', () => {
  it('sizes bars relative to the max count in the group', () => {
    expect(
      findingCountTrackWidths({ blocking: 2, suggestions: 1, nits: 1 })
    ).toEqual({ blocking: 1, suggestions: 0.5, nits: 0.5 })
  })

  it('is scale-invariant when the mix is identical', () => {
    const small = findingCountTrackWidths({
      blocking: 4,
      suggestions: 2,
      nits: 1,
    })
    const large = findingCountTrackWidths({
      blocking: 8,
      suggestions: 4,
      nits: 2,
    })
    expect(large).toEqual(small)
    expect(small).toEqual({ blocking: 1, suggestions: 0.5, nits: 0.25 })
  })

  it('does not treat 8/4/1 as the same mix as 4/2/1', () => {
    const a = findingCountTrackWidths({ blocking: 8, suggestions: 4, nits: 1 })
    const b = findingCountTrackWidths({ blocking: 4, suggestions: 2, nits: 1 })
    expect(a).not.toEqual(b)
    expect(a.nits).toBe(1 / 8)
    expect(b.nits).toBe(1 / 4)
  })

  it('returns zero-width stubs when every count is zero', () => {
    expect(
      findingCountTrackWidths({ blocking: 0, suggestions: 0, nits: 0 })
    ).toEqual({ blocking: 0, suggestions: 0, nits: 0 })
  })

  it('keeps a zero count at zero width', () => {
    const widths = findingCountTrackWidths({
      blocking: 3,
      suggestions: 0,
      nits: 0,
    })
    expect(widths.blocking).toBe(1)
    expect(widths.suggestions).toBe(0)
    expect(widths.nits).toBe(0)
  })

  it('floors non-zero slivers to a minimum visible fraction', () => {
    const widths = findingCountTrackWidths({
      blocking: 20,
      suggestions: 1,
      nits: 0,
    })
    expect(widths.blocking).toBe(1)
    expect(widths.suggestions).toBe(MIN_VISIBLE_TRACK_FRACTION)
    expect(widths.nits).toBe(0)
  })
})
