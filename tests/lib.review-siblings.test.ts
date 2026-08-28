import { siblingReviewNav } from '../src/lib/review-siblings'

describe('siblingReviewNav', () => {
  const ids = ['rev-old', 'rev-mid', 'rev-new']

  it('returns null when there is only one review', () => {
    expect(siblingReviewNav(['rev-old'], 'rev-old')).toBeNull()
  })

  it('returns null when the current id is not in the list', () => {
    expect(siblingReviewNav(ids, 'rev-missing')).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(siblingReviewNav([], 'rev-old')).toBeNull()
  })

  it('exposes older and newer ids for a middle review (1-based position)', () => {
    expect(siblingReviewNav(ids, 'rev-mid')).toEqual({
      position: 2,
      total: 3,
      olderId: 'rev-old',
      newerId: 'rev-new',
    })
  })

  it('has no older sibling on the earliest review', () => {
    expect(siblingReviewNav(ids, 'rev-old')).toEqual({
      position: 1,
      total: 3,
      olderId: null,
      newerId: 'rev-mid',
    })
  })

  it('has no newer sibling on the latest review', () => {
    expect(siblingReviewNav(ids, 'rev-new')).toEqual({
      position: 3,
      total: 3,
      olderId: 'rev-mid',
      newerId: null,
    })
  })
})
