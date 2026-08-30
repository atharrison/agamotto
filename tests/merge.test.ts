import {
  bucketFindings,
  extractIdentifiers,
  mergeResults,
} from '../src/agents/pr-review/merge'
import type { DomainResult, Finding } from '../src/agents/pr-review/schema'

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? 'f-' + Math.random().toString(36).slice(2),
    severity: overrides.severity ?? 'SUGGESTION',
    category: overrides.category ?? 'CORRECTNESS',
    file: overrides.file ?? 'src/foo.ts',
    line: overrides.line,
    title: overrides.title ?? 'Test finding',
    body: overrides.body ?? 'Description',
    confidence: overrides.confidence ?? 0.8,
    suggestedFix: overrides.suggestedFix,
  }
}

function makeResult(
  domain: DomainResult['domain'],
  findings: Finding[]
): DomainResult {
  return { domain, findings, confidence: 0.8, tokensUsed: 100, durationMs: 500 }
}

describe('mergeResults', () => {
  it('returns empty array for no results', () => {
    expect(mergeResults([])).toEqual([])
  })

  it('returns findings unchanged when no duplicates', () => {
    const a = makeFinding({ file: 'src/a.ts', line: 10, title: 'Alpha issue' })
    const b = makeFinding({ file: 'src/b.ts', line: 20, title: 'Beta issue' })
    const results = mergeResults([makeResult('CORRECTNESS', [a, b])])
    expect(results).toHaveLength(2)
  })

  it('deduplicates findings on the same file within 3 lines with similar titles', () => {
    const a = makeFinding({
      id: 'a1',
      file: 'src/foo.ts',
      line: 10,
      title: 'Missing null check',
      confidence: 0.9,
      severity: 'BLOCKING',
    })
    const b = makeFinding({
      id: 'b1',
      file: 'src/foo.ts',
      line: 11,
      title: 'Missing null check here',
      confidence: 0.75,
      severity: 'SUGGESTION',
    })
    const results = mergeResults([
      makeResult('CORRECTNESS', [a]),
      makeResult('SECURITY', [b]),
    ])
    expect(results).toHaveLength(1)
    // Severity promotes to BLOCKING and confidence takes the strongest claim
    expect(results[0].severity).toBe('BLOCKING')
    expect(results[0].confidence).toBe(0.9)
  })

  it('does not dedup findings on different files', () => {
    const a = makeFinding({
      file: 'src/a.ts',
      line: 10,
      title: 'Null check missing',
    })
    const b = makeFinding({
      file: 'src/b.ts',
      line: 10,
      title: 'Null check missing',
    })
    expect(mergeResults([makeResult('CORRECTNESS', [a, b])])).toHaveLength(2)
  })

  it('does not dedup findings that are far apart on the same file', () => {
    const a = makeFinding({ file: 'src/a.ts', line: 10, title: 'Null check' })
    const b = makeFinding({
      file: 'src/a.ts',
      line: 50,
      title: 'Null check issue',
    })
    expect(mergeResults([makeResult('CORRECTNESS', [a, b])])).toHaveLength(2)
  })

  it('applies confidence penalty (×0.9) to uncorroborated findings', () => {
    const a = makeFinding({
      id: 'solo',
      confidence: 1.0,
      file: 'src/x.ts',
      line: 1,
      title: 'Unique',
    })
    const results = mergeResults([makeResult('CORRECTNESS', [a])])
    expect(results[0].confidence).toBeCloseTo(0.9)
  })

  it('sorts BLOCKING before SUGGESTION before NIT', () => {
    const nit = makeFinding({
      file: 'src/nit.ts',
      title: 'Nit issue',
      severity: 'NIT',
      confidence: 1.0,
    })
    const blocking = makeFinding({
      file: 'src/block.ts',
      title: 'Blocking issue',
      severity: 'BLOCKING',
      confidence: 0.7,
    })
    const suggestion = makeFinding({
      file: 'src/suggest.ts',
      title: 'Suggestion issue',
      severity: 'SUGGESTION',
      confidence: 0.8,
    })
    const sorted = mergeResults([
      makeResult('CORRECTNESS', [nit, suggestion, blocking]),
    ])
    expect(sorted).toHaveLength(3)
    expect(sorted[0].severity).toBe('BLOCKING')
    expect(sorted[1].severity).toBe('SUGGESTION')
    expect(sorted[2].severity).toBe('NIT')
  })

  it('sorts by confidence desc within same severity', () => {
    const low = makeFinding({
      file: 'src/a.ts',
      title: 'Low suggestion',
      severity: 'SUGGESTION',
      confidence: 0.7,
    })
    const high = makeFinding({
      file: 'src/b.ts',
      title: 'High suggestion',
      severity: 'SUGGESTION',
      confidence: 0.95,
    })
    const sorted = mergeResults([makeResult('CORRECTNESS', [low, high])])
    expect(sorted).toHaveLength(2)
    expect(sorted[0].confidence).toBeGreaterThan(sorted[1].confidence)
  })
})

describe('multi-attribution (ATH-50)', () => {
  it('credits every agent that raised the defect', () => {
    const a = makeFinding({
      id: 'a',
      file: 'src/foo.ts',
      line: 10,
      title: 'Missing null check',
      category: 'CORRECTNESS',
    })
    const b = makeFinding({
      id: 'b',
      file: 'src/foo.ts',
      line: 11,
      title: 'Missing null check here',
      category: 'SECURITY',
    })
    const [merged] = mergeResults([
      makeResult('CORRECTNESS', [a]),
      makeResult('SECURITY', [b]),
    ])
    expect(merged.categories).toEqual(['CORRECTNESS', 'SECURITY'])
  })

  it('gives solo findings a single-entry attribution list', () => {
    const [solo] = mergeResults([
      makeResult('STYLE', [makeFinding({ category: 'STYLE' })]),
    ])
    expect(solo.categories).toEqual(['STYLE'])
  })

  it('does not duplicate an agent that raised two paraphrases of one defect', () => {
    const findings = [
      makeFinding({
        id: 'a',
        file: 'src/foo.ts',
        line: 10,
        title: 'Null check missing',
      }),
      makeFinding({
        id: 'b',
        file: 'src/foo.ts',
        line: 10,
        title: 'Null check missing here',
      }),
    ]
    const [merged] = mergeResults([makeResult('CORRECTNESS', findings)])
    expect(merged.categories).toEqual(['CORRECTNESS'])
  })

  it('accumulates attribution across three agents', () => {
    const at = (id: string, category: Finding['category']) =>
      makeFinding({
        id,
        category,
        file: 'src/foo.ts',
        line: 10,
        title: 'Leaked secret token',
      })
    const [merged] = mergeResults([
      makeResult('STYLE', [at('a', 'STYLE')]),
      makeResult('CORRECTNESS', [at('b', 'CORRECTNESS')]),
      makeResult('SECURITY', [at('c', 'SECURITY')]),
    ])
    expect(merged.categories).toEqual(['STYLE', 'CORRECTNESS', 'SECURITY'])
    expect(merged.category).toBe('SECURITY')
  })
})

describe('domain precedence (ATH-50)', () => {
  const pair = (
    aCategory: Finding['category'],
    bCategory: Finding['category'],
    aConfidence = 0.95,
    bConfidence = 0.7
  ) =>
    mergeResults([
      makeResult(aCategory, [
        makeFinding({
          id: 'a',
          category: aCategory,
          confidence: aConfidence,
          file: 'src/foo.ts',
          line: 10,
          title: 'Scan of a huge array',
          body: 'from the first agent',
        }),
      ]),
      makeResult(bCategory, [
        makeFinding({
          id: 'b',
          category: bCategory,
          confidence: bConfidence,
          file: 'src/foo.ts',
          line: 10,
          title: 'Scan of a huge array again',
          body: 'from the second agent',
        }),
      ]),
    ])

  it('lets the specialist write-up survive over a more confident catch-all', () => {
    const [merged] = pair('CORRECTNESS', 'PERFORMANCE')
    expect(merged.category).toBe('PERFORMANCE')
    expect(merged.body).toBe('from the second agent')
  })

  it('keeps the strongest confidence even when the specialist was less sure', () => {
    const [merged] = pair('CORRECTNESS', 'PERFORMANCE')
    expect(merged.confidence).toBe(0.95)
  })

  it('ranks security above performance above conventions above correctness above style', () => {
    expect(pair('PERFORMANCE', 'SECURITY')[0].category).toBe('SECURITY')
    expect(pair('CONVENTIONS', 'PERFORMANCE')[0].category).toBe('PERFORMANCE')
    expect(pair('CORRECTNESS', 'CONVENTIONS')[0].category).toBe('CONVENTIONS')
    expect(pair('STYLE', 'CORRECTNESS')[0].category).toBe('CORRECTNESS')
  })

  it('falls back to confidence within a single domain', () => {
    const [merged] = pair('STYLE', 'STYLE', 0.7, 0.95)
    expect(merged.body).toBe('from the second agent')
  })
})

describe('identifier-aware dedup (ATH-50)', () => {
  // Titles taken from control run R7, where the same planted credential was
  // reported five times because the paraphrases share few title words.
  const tokenFinding = (
    id: string,
    category: Finding['category'],
    line: number,
    title: string
  ) =>
    makeFinding({
      id,
      category,
      line,
      file: 'src/lib/confidence-bar.ts',
      title,
      body: 'The constant DEBUG_GH_TOKEN is committed to source.',
    })

  it('collapses paraphrases of one defect that share a named symbol', () => {
    const merged = mergeResults([
      makeResult('CORRECTNESS', [
        tokenFinding(
          'a',
          'CORRECTNESS',
          19,
          'Hardcoded credential (DEBUG_GH_TOKEN) exported and sent over the network'
        ),
      ]),
      makeResult('STYLE', [
        tokenFinding(
          'b',
          'STYLE',
          20,
          'DEBUG_GH_TOKEN is a hard-coded secret exported from a library module'
        ),
      ]),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].categories).toEqual(['CORRECTNESS', 'STYLE'])
  })

  it('keeps distinct defects on adjacent lines apart even when they name the same symbol', () => {
    // The credential leak and the fetch-per-render are the same useEffect, but
    // they are two defects — collapsing them would silently drop one.
    const leak = makeFinding({
      id: 'a',
      category: 'SECURITY',
      file: 'app/components/ConfidenceBar.tsx',
      line: 44,
      title: 'Credential leaked to browser network via client-side fetch',
      body: 'DEBUG_GH_TOKEN is sent as a Bearer header from useEffect.',
    })
    const perRender = makeFinding({
      id: 'b',
      category: 'STYLE',
      file: 'app/components/ConfidenceBar.tsx',
      line: 43,
      title: 'useEffect fires a debug health-ping on every render',
      body: 'An unexplained side-effect using DEBUG_GH_TOKEN in a display component.',
    })
    expect(
      mergeResults([
        makeResult('SECURITY', [leak]),
        makeResult('STYLE', [perRender]),
      ])
    ).toHaveLength(2)
  })

  it('still requires the same file when a symbol is shared', () => {
    const declaration = tokenFinding(
      'a',
      'SECURITY',
      19,
      'DEBUG_GH_TOKEN hardcoded in the library'
    )
    const usage = makeFinding({
      id: 'b',
      category: 'CORRECTNESS',
      file: 'app/components/ConfidenceBar.tsx',
      line: 19,
      title: 'DEBUG_GH_TOKEN hardcoded in the component',
      body: 'Same symbol, different file.',
    })
    expect(
      mergeResults([
        makeResult('SECURITY', [declaration]),
        makeResult('CORRECTNESS', [usage]),
      ])
    ).toHaveLength(2)
  })

  it('still requires nearby lines when a symbol is shared', () => {
    const near = tokenFinding(
      'a',
      'SECURITY',
      19,
      'DEBUG_GH_TOKEN hardcoded in the library'
    )
    const far = tokenFinding(
      'b',
      'STYLE',
      200,
      'DEBUG_GH_TOKEN referenced far below'
    )
    expect(
      mergeResults([makeResult('SECURITY', [near]), makeResult('STYLE', [far])])
    ).toHaveLength(2)
  })
})

describe('duplicate edge cases', () => {
  it('merges two file-level findings that carry no line number', () => {
    const fileLevel = (id: string, category: Finding['category']) => {
      const f = makeFinding({
        id,
        category,
        file: 'src/foo.ts',
        title: 'Module lacks tests',
      })
      delete (f as Partial<Finding>).line
      return f
    }
    expect(
      mergeResults([
        makeResult('STYLE', [fileLevel('a', 'STYLE')]),
        makeResult('CONVENTIONS', [fileLevel('b', 'CONVENTIONS')]),
      ])
    ).toHaveLength(1)
  })

  it('does not merge a file-level finding with a line-anchored one on title alone', () => {
    const fileLevel = makeFinding({
      id: 'a',
      file: 'src/foo.ts',
      title: 'Module lacks tests',
    })
    delete (fileLevel as Partial<Finding>).line
    const anchored = makeFinding({
      id: 'b',
      file: 'src/foo.ts',
      line: 400,
      title: 'Something entirely different',
    })
    expect(
      mergeResults([
        makeResult('STYLE', [fileLevel]),
        makeResult('CONVENTIONS', [anchored]),
      ])
    ).toHaveLength(2)
  })

  it('treats an empty title as no overlap rather than a perfect match', () => {
    expect(
      mergeResults([
        makeResult('STYLE', [
          makeFinding({ id: 'a', file: 'src/foo.ts', line: 10, title: '' }),
        ]),
        makeResult('CONVENTIONS', [
          makeFinding({ id: 'b', file: 'src/foo.ts', line: 10, title: '' }),
        ]),
      ])
    ).toHaveLength(2)
  })

  it('matches a third paraphrase on a symbol the second one contributed', () => {
    // `c` names no symbol from `a`, only one `b` introduced. Its title overlap
    // with the surviving finding clears the relaxed bar but not the strict one,
    // so it merges only because the winner accumulated `b`'s identifiers.
    const findings = [
      makeFinding({
        id: 'a',
        category: 'SECURITY',
        file: 'src/foo.ts',
        line: 10,
        title: 'Hardcoded DEBUG_GH_TOKEN in source',
      }),
      makeFinding({
        id: 'b',
        category: 'STYLE',
        file: 'src/foo.ts',
        line: 10,
        title: 'DEBUG_GH_TOKEN should come from readGithubToken',
      }),
      makeFinding({
        id: 'c',
        category: 'CONVENTIONS',
        file: 'src/foo.ts',
        line: 11,
        title: 'Hardcoded token from readGithubToken instead',
      }),
    ]
    const merged = mergeResults([makeResult('SECURITY', findings)])
    expect(merged).toHaveLength(1)
    expect(merged[0].categories).toEqual(['SECURITY', 'STYLE', 'CONVENTIONS'])
  })
})

describe('extractIdentifiers', () => {
  it('picks up CONSTANT_CASE and camelCase symbols', () => {
    const ids = extractIdentifiers(
      makeFinding({
        title: 'DEBUG_GH_TOKEN leaks',
        body: 'getConfidenceTier allocates',
      })
    )
    expect(ids.has('DEBUG_GH_TOKEN')).toBe(true)
    expect(ids.has('getConfidenceTier')).toBe(true)
  })

  it('ignores PascalCase, which is mostly component and type names', () => {
    const ids = extractIdentifiers(
      makeFinding({
        title: 'ConfidenceBar renders wrong',
        body: 'See PRReview.',
      })
    )
    expect(ids.has('ConfidenceBar')).toBe(false)
    expect(ids.has('PRReview')).toBe(false)
  })

  it('ignores ordinary prose words', () => {
    const ids = extractIdentifiers(
      makeFinding({ title: 'the loop is wrong', body: 'off by one error' })
    )
    expect(ids.size).toBe(0)
  })

  it('reads the suggestedFix as well as the title and body', () => {
    const ids = extractIdentifiers(
      makeFinding({
        title: 'plain',
        body: 'prose',
        suggestedFix: 'call useMemo instead',
      })
    )
    expect(ids.has('useMemo')).toBe(true)
  })
})

describe('bucketFindings', () => {
  it('splits findings into three buckets by severity', () => {
    const findings: Finding[] = [
      makeFinding({ severity: 'BLOCKING' }),
      makeFinding({ severity: 'SUGGESTION' }),
      makeFinding({ severity: 'NIT' }),
    ]
    const { blockingIssues, suggestions, nits } = bucketFindings(findings)
    expect(blockingIssues).toHaveLength(1)
    expect(suggestions).toHaveLength(1)
    expect(nits).toHaveLength(1)
  })
})
