import {
  DEFAULT_QUEUE_VIEW,
  allCollapsed,
  parseQueueView,
  repoCounts,
  repoKey,
  serializeQueueView,
  setCollapsed,
  toggleKey,
  withoutHiddenRepos,
} from '../src/lib/queue-view'

const pr = (owner: string, repo: string, n = 1) => ({ owner, repo, n })

describe('repoKey', () => {
  it('joins owner and repo', () => {
    expect(repoKey(pr('acme', 'app'))).toBe('acme/app')
  })
})

describe('parseQueueView / serializeQueueView', () => {
  it('returns defaults for null, empty, and corrupt storage', () => {
    expect(parseQueueView(null)).toBe(DEFAULT_QUEUE_VIEW)
    expect(parseQueueView('')).toBe(DEFAULT_QUEUE_VIEW)
    expect(parseQueueView('{not json')).toBe(DEFAULT_QUEUE_VIEW)
  })

  it('returns defaults for JSON that is not an object', () => {
    expect(parseQueueView('null')).toBe(DEFAULT_QUEUE_VIEW)
    expect(parseQueueView('"x"')).toBe(DEFAULT_QUEUE_VIEW)
    expect(parseQueueView('42')).toBe(DEFAULT_QUEUE_VIEW)
  })

  it('treats missing or non-array fields as empty and drops non-strings', () => {
    expect(parseQueueView('{}')).toEqual(DEFAULT_QUEUE_VIEW)
    expect(
      parseQueueView('{"collapsedRepos":"a/b","hiddenRepos":[1,"c/d",null]}')
    ).toEqual({ collapsedRepos: [], hiddenRepos: ['c/d'] })
  })

  it('round-trips a state', () => {
    const state = { collapsedRepos: ['a/b'], hiddenRepos: ['c/d', 'e/f'] }
    expect(parseQueueView(serializeQueueView(state))).toEqual(state)
  })
})

describe('toggleKey', () => {
  it('adds a missing key without mutating the input', () => {
    const list = ['a']
    expect(toggleKey(list, 'b')).toEqual(['a', 'b'])
    expect(list).toEqual(['a'])
  })

  it('removes a present key', () => {
    expect(toggleKey(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('repoCounts', () => {
  it('counts per repo in first-seen order', () => {
    expect(
      repoCounts([
        pr('acme', 'web'),
        pr('acme', 'api'),
        pr('acme', 'web'),
        pr('other', 'web'),
      ])
    ).toEqual([
      { key: 'acme/web', count: 2 },
      { key: 'acme/api', count: 1 },
      { key: 'other/web', count: 1 },
    ])
  })

  it('returns an empty list for no PRs', () => {
    expect(repoCounts([])).toEqual([])
  })
})

describe('withoutHiddenRepos', () => {
  const prs = [pr('acme', 'web', 1), pr('acme', 'api', 2), pr('acme', 'web', 3)]

  it('returns the same array when nothing is hidden', () => {
    expect(withoutHiddenRepos(prs, [])).toBe(prs)
  })

  it('drops PRs from hidden repos only', () => {
    expect(withoutHiddenRepos(prs, ['acme/web']).map(p => p.n)).toEqual([2])
  })

  it('ignores hidden keys that match no PR (repo removed)', () => {
    expect(withoutHiddenRepos(prs, ['gone/repo'])).toHaveLength(3)
  })

  it('shows a repo that is not in the hidden list (new repo defaults visible)', () => {
    expect(
      withoutHiddenRepos([...prs, pr('new', 'repo', 4)], ['acme/web']).map(
        p => p.n
      )
    ).toEqual([2, 4])
  })
})

describe('setCollapsed', () => {
  it('collapses the given keys without duplicating existing ones', () => {
    expect(setCollapsed(['a'], ['a', 'b'], true).sort()).toEqual(['a', 'b'])
  })

  it('expands the given keys', () => {
    expect(setCollapsed(['a', 'b'], ['a', 'b'], false)).toEqual([])
  })

  it('leaves collapse state of repos outside the given keys alone', () => {
    expect(setCollapsed(['hidden/repo'], ['a'], true).sort()).toEqual([
      'a',
      'hidden/repo',
    ])
    expect(setCollapsed(['hidden/repo', 'a'], ['a'], false)).toEqual([
      'hidden/repo',
    ])
  })
})

describe('allCollapsed', () => {
  it('is true only when every key is collapsed', () => {
    expect(allCollapsed(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(allCollapsed(['a'], ['a', 'b'])).toBe(false)
  })

  it('is false for no keys', () => {
    expect(allCollapsed(['a'], [])).toBe(false)
  })
})
