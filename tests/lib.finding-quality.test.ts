import {
  FINDING_QUALITY_FILTER_ENV,
  FindingQualityFilter,
  HEDGE_NOTE,
  INCOMPLETE_CONTEXT_NOTE,
  MIN_FINDING_CONFIDENCE,
  QUALITY_ADJUSTED_CONFIDENCE_CAP,
  TITLE_BODY_NOTE,
  TRUNCATED_FILE_NOTE,
  UNGROUNDED_NOTE,
  applyFindingQualityFilters,
  defaultFindingAccepted,
  isFindingQualityFilterEnabled,
  prepareFindingsForMerge,
} from '../src/lib/finding-quality'
import type {
  DomainResult,
  EnrichedContext,
  Finding,
} from '../src/agents/pr-review/schema'

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? 'f-1',
    severity: overrides.severity ?? 'BLOCKING',
    category: overrides.category ?? 'CORRECTNESS',
    file: overrides.file ?? 'src/foo.ts',
    line: overrides.line,
    title: overrides.title ?? 'Test finding',
    body: overrides.body ?? 'Description',
    confidence: overrides.confidence ?? 0.85,
    suggestedFix: overrides.suggestedFix,
  }
}

function makeContext(
  overrides: Partial<EnrichedContext> = {}
): EnrichedContext {
  return {
    prUrl: 'https://github.com/owner/repo/pull/1',
    prTitle: 'Feature',
    prAuthor: 'alice',
    prBranch: 'feat',
    diff: overrides.diff ?? 'diff --git a/src/foo.ts b/src/foo.ts\n+ok',
    filesChanged: overrides.filesChanged ?? ['src/foo.ts'],
    fileCoverage: overrides.fileCoverage ?? [
      { file: 'src/foo.ts', status: 'READ' },
    ],
    externalContextCalls: 0,
    ...overrides,
  }
}

function makeResult(
  domain: DomainResult['domain'],
  findings: Finding[]
): DomainResult {
  return {
    domain,
    findings,
    confidence: 0.8,
    tokensUsed: 100,
    cost: 0,
    durationMs: 50,
  }
}

const ON = { [FINDING_QUALITY_FILTER_ENV]: FindingQualityFilter.ON }
const OFF = { [FINDING_QUALITY_FILTER_ENV]: FindingQualityFilter.OFF }

describe('isFindingQualityFilterEnabled', () => {
  it('defaults to ON when the env var is unset or blank', () => {
    expect(isFindingQualityFilterEnabled({})).toBe(true)
    expect(
      isFindingQualityFilterEnabled({ [FINDING_QUALITY_FILTER_ENV]: '' })
    ).toBe(true)
    expect(
      isFindingQualityFilterEnabled({ [FINDING_QUALITY_FILTER_ENV]: '  ' })
    ).toBe(true)
  })

  it('reads process.env when no env bag is passed', () => {
    const prev = process.env[FINDING_QUALITY_FILTER_ENV]
    delete process.env[FINDING_QUALITY_FILTER_ENV]
    expect(isFindingQualityFilterEnabled()).toBe(true)
    if (prev === undefined) {
      delete process.env[FINDING_QUALITY_FILTER_ENV]
    } else {
      process.env[FINDING_QUALITY_FILTER_ENV] = prev
    }
  })

  it('treats ON as enabled, including lowercase at the env boundary', () => {
    expect(isFindingQualityFilterEnabled(ON)).toBe(true)
    expect(
      isFindingQualityFilterEnabled({ [FINDING_QUALITY_FILTER_ENV]: 'on' })
    ).toBe(true)
  })

  it('treats OFF as disabled, including lowercase at the env boundary', () => {
    expect(isFindingQualityFilterEnabled(OFF)).toBe(false)
    expect(
      isFindingQualityFilterEnabled({ [FINDING_QUALITY_FILTER_ENV]: 'off' })
    ).toBe(false)
  })
})

describe('prepareFindingsForMerge (ATH-35 withdrawals)', () => {
  it('still emits findings below the prompt floor so a later slider can see them', () => {
    const low = makeFinding({
      id: 'low',
      confidence: 0.675,
      severity: 'SUGGESTION',
      title: 'Tracking pixel',
      body: 'Might be worth a header.',
    })
    const keep = makeFinding({ id: 'keep', confidence: 0.7 })
    const prepared = prepareFindingsForMerge(
      [makeResult('SECURITY', [low, keep])],
      ON
    )
    expect(prepared[0].findings.map(f => f.id)).toEqual(['low', 'keep'])
  })

  it('keeps a low-confidence ATH-16 hedge so the post-merge downgrade can run', () => {
    const ath16 = makeFinding({
      id: 'ath-16',
      confidence: 0.59,
      title: '204 for non-PR events returned after full auth',
      body: 'The real issue is that the 204 for non-PR events is returned correctly only after full auth — this appears correct. No blocking issue here on re-examination.',
    })
    const prepared = prepareFindingsForMerge(
      [makeResult('CORRECTNESS', [ath16])],
      ON
    )
    expect(prepared[0].findings).toHaveLength(1)
  })

  it('drops explicit withdrawals even above the floor', () => {
    const withdrawn = makeFinding({
      id: 'gone',
      confidence: 0.9,
      title: 'Missing JSDoc on exported component',
      body: 'Verified: the comment at line 33 does exist as a JSDoc block. Withdrawing this finding.',
    })
    const prepared = prepareFindingsForMerge(
      [makeResult('CONVENTIONS', [withdrawn])],
      ON
    )
    expect(prepared[0].findings).toEqual([])
  })

  it('is a no-op when the filter is OFF', () => {
    const low = makeFinding({ id: 'low', confidence: 0.45 })
    const prepared = prepareFindingsForMerge(
      [makeResult('CORRECTNESS', [low])],
      OFF
    )
    expect(prepared[0].findings).toHaveLength(1)
  })
})

describe('applyFindingQualityFilters — ATH-35 hedging', () => {
  const ctx = makeContext()

  it('downgrades the ATH-16 blocking walk-back to SUGGESTION and appends the hedge note', () => {
    const ath16 = makeFinding({
      id: 'ath-16',
      confidence: 0.59,
      title: '204 for non-PR events returned after full auth',
      body: 'The real issue is that the 204 for non-PR events is returned correctly only after full auth — this appears correct. No blocking issue here on re-examination.',
    })
    const [out] = applyFindingQualityFilters([ath16], ctx, ON)
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(0.59)
    expect(out.body).toContain(HEDGE_NOTE)
    expect(out.body).toContain('No blocking issue here on re-examination')
  })

  it('downgrades each listed hedge phrase on a BLOCKING finding', () => {
    const phrases = [
      'not actually blocking',
      'upon further examination this looks fine',
      'on reflection this is overstated',
      'this is more of a suggestion',
      'lower priority than initially stated',
      'may not be necessary',
    ]
    for (const phrase of phrases) {
      const [out] = applyFindingQualityFilters(
        [makeFinding({ id: phrase, body: `Evidence. ${phrase}.` })],
        ctx,
        ON
      )
      expect(out.severity).toBe('SUGGESTION')
      expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
      expect(out.body).toContain(HEDGE_NOTE)
    }
  })

  it('does not downgrade a BLOCKING finding with no hedge', () => {
    const [out] = applyFindingQualityFilters(
      [makeFinding({ body: 'Null deref on the error path. Return 500.' })],
      ctx,
      ON
    )
    expect(out.severity).toBe('BLOCKING')
    expect(out.confidence).toBe(0.85)
    expect(out.body).not.toContain(HEDGE_NOTE)
  })

  it('drops "omitting this finding" even when severity is NIT', () => {
    const omitted = makeFinding({
      severity: 'NIT',
      confidence: 0.585,
      title: 'Import order in ReviewShell',
      body: 'No clear violation — omitting this finding.',
    })
    expect(applyFindingQualityFilters([omitted], ctx, ON)).toEqual([])
  })

  it('leaves SUGGESTION/NIT severity alone when the body hedges but does not withdraw', () => {
    const suggestion = makeFinding({
      severity: 'SUGGESTION',
      body: 'On reflection this is more of a suggestion than a defect.',
    })
    const [out] = applyFindingQualityFilters([suggestion], ctx, ON)
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
  })
})

describe('applyFindingQualityFilters — ATH-35 title/body contradiction', () => {
  const ctx = makeContext()

  it('flags the ATH-16 updated_since_review true-vs-false mismatch', () => {
    const finding = makeFinding({
      title:
        'reopened action does not set updated_since_review=true, leaving stale review state',
      body: 'The reopened handler should set `updated_since_review` explicitly (likely false for a clean reopen).',
      suggestedFix: 'updated_since_review: false',
    })
    const [out] = applyFindingQualityFilters([finding], ctx, ON)
    expect(out.body).toContain(TITLE_BODY_NOTE)
    expect(out.severity).toBe('BLOCKING')
    expect(out.confidence).toBe(0.85)
  })

  it('does not flag when title and body agree on the boolean', () => {
    const finding = makeFinding({
      title: 'handler sets dry_run=true and skips the GitHub write',
      body: 'Keep dry_run=true in production until the token is scoped.',
      suggestedFix: 'dry_run: true',
    })
    const [out] = applyFindingQualityFilters([finding], ctx, ON)
    expect(out.body).not.toContain(TITLE_BODY_NOTE)
  })
})

describe('applyFindingQualityFilters — ATH-39 replay fixtures', () => {
  it('does not keep the ATH-15 indent-hunk "error key stripped" finding as BLOCKING', () => {
    const ctx = makeContext({
      filesChanged: ['app/api/review/[id]/route.ts'],
      fileCoverage: [
        { file: 'app/api/review/[id]/route.ts', status: 'TRUNCATED' },
      ],
      diff: `diff --git a/app/api/review/[id]/route.ts b/app/api/review/[id]/route.ts
@@ -80,8 +80,7 @@
         send('error', {
-            error:
-              'Failed to initialize review …',
+          })
// [patch truncated — 12000 bytes omitted]
`,
    })
    const finding = makeFinding({
      file: 'app/api/review/[id]/route.ts',
      title: 'error key stripped from send(); client gets empty object',
      body: "The hunk shows send('error', {}) — the error key was stripped.",
      confidence: 0.92,
    })
    const out = applyFindingQualityFilters([finding], ctx, ON)
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('SUGGESTION')
    expect(out[0].confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
  })

  it('emits a deletion claim at capped confidence when the cited string is still in the visible patch', () => {
    const ctx = makeContext({
      filesChanged: ['app/api/review/[id]/route.ts'],
      fileCoverage: [{ file: 'app/api/review/[id]/route.ts', status: 'READ' }],
      diff: `diff --git a/app/api/review/[id]/route.ts b/app/api/review/[id]/route.ts
@@
         send('error', {
           error:
             'Failed to initialize review',
         })
`,
    })
    const finding = makeFinding({
      file: 'app/api/review/[id]/route.ts',
      title: 'error key stripped from send(); client gets empty object',
      body: "The error key was stripped. send('error', {}) no longer includes `Failed to initialize review`.",
    })
    const [out] = applyFindingQualityFilters([finding], ctx, ON)
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
    expect(out.body).toContain(UNGROUNDED_NOTE)
  })

  it('does not keep the ATH-38 literal-ellipsis placeholder finding as BLOCKING', () => {
    const ctx = makeContext({
      filesChanged: ['tests/observability.test.ts'],
      fileCoverage: [
        { file: 'tests/observability.test.ts', status: 'TRUNCATED' },
      ],
      diff: `diff --git a/tests/observability.test.ts b/tests/observability.test.ts
@@
 it('exports NONE', () => {
   ...
 })
// [patch truncated — 8000 bytes omitted]
`,
    })
    const finding = makeFinding({
      file: 'tests/observability.test.ts',
      title: 'tests will fail to compile — literal ... placeholders',
      body: 'pseudocode — actual test bodies are elided with `...` placeholders',
      confidence: 0.9,
    })
    const out = applyFindingQualityFilters([finding], ctx, ON)
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('SUGGESTION')
    expect(out[0].confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
  })

  it('caps an already-SUGGESTION placeholder claim on a truncated file without changing severity', () => {
    const ctx = makeContext({
      filesChanged: ['tests/observability.test.ts'],
      fileCoverage: [
        { file: 'tests/observability.test.ts', status: 'TRUNCATED' },
      ],
      diff: 'diff --git a/tests/observability.test.ts\n+it("x", () => { ... })\n// [patch truncated — 1 bytes omitted]\n',
    })
    const finding = makeFinding({
      severity: 'SUGGESTION',
      confidence: 0.9,
      file: 'tests/observability.test.ts',
      title: 'tests will fail to compile — literal ... placeholders',
      body: 'elided with `...` placeholders',
    })
    const [out] = applyFindingQualityFilters([finding], ctx, ON)
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
    expect(out.body).toContain(TRUNCATED_FILE_NOTE)
  })

  it('downgrades a speculative FK/TOCTOU finding on a truncated start/route.ts', () => {
    const ctx = makeContext({
      filesChanged: ['app/api/review/start/route.ts'],
      fileCoverage: [
        { file: 'app/api/review/start/route.ts', status: 'TRUNCATED' },
      ],
      diff: `diff --git a/app/api/review/start/route.ts b/app/api/review/start/route.ts
@@
 export async function POST() {
   await createReview()
// [patch truncated — 4000 bytes omitted]
`,
    })
    const finding = makeFinding({
      file: 'app/api/review/start/route.ts',
      title:
        'markPrInReview may run before createReview commits (FK violation)',
      body: 'Cannot confirm ordering because the file is truncated. Possible TOCTOU if SSE reads existing while /start is still writing.',
      confidence: 0.88,
    })
    const [out] = applyFindingQualityFilters([finding], ctx, ON)
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
    expect(
      out.body.includes(INCOMPLETE_CONTEXT_NOTE) ||
        out.body.includes(TRUNCATED_FILE_NOTE)
    ).toBe(true)
  })

  it('downgrades any remaining BLOCKING finding whose cited file is truncated', () => {
    const ctx = makeContext({
      filesChanged: ['src/harness/observability.ts'],
      fileCoverage: [
        { file: 'src/harness/observability.ts', status: 'TRUNCATED' },
      ],
      diff: 'diff --git a/src/harness/observability.ts\n+export function withSpan() {}\n// [patch truncated — 100 bytes omitted]\n',
    })
    const finding = makeFinding({
      file: 'src/harness/observability.ts',
      title: 'withSpan always calls span.end() on NOOP_SPAN',
      body: 'NOOP_SPAN.end() runs on every call.',
    })
    const [out] = applyFindingQualityFilters([finding], ctx, ON)
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
    expect(out.body).toContain(TRUNCATED_FILE_NOTE)
  })

  it('downgrades a BLOCKING finding that abstains because of a truncated diff even when coverage says READ', () => {
    const ctx = makeContext({
      filesChanged: ['src/lib/prior-rounds.ts'],
      fileCoverage: [{ file: 'src/lib/prior-rounds.ts', status: 'READ' }],
      diff: 'diff --git a/src/lib/prior-rounds.ts b/src/lib/prior-rounds.ts\n+export function loadPriorRounds() {}\n',
    })
    const finding = makeFinding({
      file: 'src/lib/prior-rounds.ts',
      title: 'cannot confirm loadPriorRounds excludeId',
      body: 'Cannot confirm because truncated diff — incomplete view of the coordinator overwrite.',
    })
    const [out] = applyFindingQualityFilters([finding], ctx, ON)
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
    expect(out.body).toContain(INCOMPLETE_CONTEXT_NOTE)
  })

  it('does not drop a placeholder claim when the cited file was fully read', () => {
    const ctx = makeContext({
      filesChanged: ['tests/observability.test.ts'],
      fileCoverage: [{ file: 'tests/observability.test.ts', status: 'READ' }],
      diff: 'diff --git a/tests/observability.test.ts\n+it("exports NONE", () => { expect(1).toBe(1) })\n',
    })
    const finding = makeFinding({
      file: 'tests/observability.test.ts',
      title: 'tests will fail to compile — literal ... placeholders',
      body: 'pseudocode — actual test bodies are elided with `...` placeholders',
    })
    const [out] = applyFindingQualityFilters([finding], ctx, ON)
    expect(out.severity).toBe('BLOCKING')
  })

  it('treats filesChanged as enough to honor the patch sentinel when the path is absent from the diff text', () => {
    const ctx = makeContext({
      filesChanged: ['src/hidden.ts'],
      fileCoverage: [{ file: 'src/hidden.ts', status: 'READ' }],
      diff: 'diff --git a/other.ts b/other.ts\n+ok\n// [patch truncated — 50 bytes omitted]\n',
    })
    const [out] = applyFindingQualityFilters(
      [
        makeFinding({
          file: 'src/hidden.ts',
          body: 'Possible race in the unseen helper.',
        }),
      ],
      ctx,
      ON
    )
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
    expect(out.body).toContain(TRUNCATED_FILE_NOTE)
  })

  it('does not treat a minus-line-only snippet as still present', () => {
    const ctx = makeContext({
      filesChanged: ['app/api/review/[id]/route.ts'],
      fileCoverage: [{ file: 'app/api/review/[id]/route.ts', status: 'READ' }],
      diff: `diff --git a/app/api/review/[id]/route.ts b/app/api/review/[id]/route.ts
@@
         send('error', {
-            error: 'Failed to initialize review',
+          })
`,
    })
    const finding = makeFinding({
      file: 'app/api/review/[id]/route.ts',
      title: 'error key stripped',
      body: "The error key was stripped; 'Failed to initialize review' is gone.",
    })
    const out = applyFindingQualityFilters([finding], ctx, ON)
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('BLOCKING')
  })

  it('treats a READ file as truncated when the patch sentinel is in the diff', () => {
    const ctx = makeContext({
      filesChanged: ['src/foo.ts'],
      fileCoverage: [{ file: 'src/foo.ts', status: 'READ' }],
      diff: 'diff --git a/src/foo.ts b/src/foo.ts\n+export const x = 1\n// [patch truncated — 50 bytes omitted]\n',
    })
    const [out] = applyFindingQualityFilters(
      [makeFinding({ body: 'Null deref after the unseen helper.' })],
      ctx,
      ON
    )
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
    expect(out.body).toContain(TRUNCATED_FILE_NOTE)
  })

  it('does not treat the marker declaration in our own source as truncation', () => {
    const ctx = makeContext({
      filesChanged: ['src/lib/ground-truth-diff.ts'],
      fileCoverage: [{ file: 'src/lib/ground-truth-diff.ts', status: 'READ' }],
      diff: `diff --git a/src/lib/ground-truth-diff.ts b/src/lib/ground-truth-diff.ts
+export const PATCH_TRUNCATED_MARKER = '[patch truncated'
`,
    })
    const [out] = applyFindingQualityFilters(
      [
        makeFinding({
          file: 'src/lib/ground-truth-diff.ts',
          title: 'linesRead is computed from the emitted text length',
          body: 'The slice credits bytes the agent never saw.',
        }),
      ],
      ctx,
      ON
    )
    expect(out.severity).toBe('BLOCKING')
    expect(out.body).not.toContain(TRUNCATED_FILE_NOTE)
  })

  it('confines a real truncation to the file whose section carries it', () => {
    const ctx = makeContext({
      filesChanged: ['src/big.ts', 'src/small.ts'],
      fileCoverage: [
        { file: 'src/big.ts', status: 'READ' },
        { file: 'src/small.ts', status: 'READ' },
      ],
      diff: `diff --git a/src/big.ts b/src/big.ts
+export const big = 1
// [patch truncated — 900 bytes omitted]
diff --git a/src/small.ts b/src/small.ts
+export const small = 2
`,
    })
    const [big, small] = applyFindingQualityFilters(
      [
        makeFinding({ file: 'src/big.ts', body: 'Race in the unseen tail.' }),
        makeFinding({ file: 'src/small.ts', body: 'Off-by-one on line 2.' }),
      ],
      ctx,
      ON
    )
    expect(big.severity).toBe('SUGGESTION')
    expect(big.body).toContain(TRUNCATED_FILE_NOTE)
    expect(small.severity).toBe('BLOCKING')
    expect(small.body).not.toContain(TRUNCATED_FILE_NOTE)
  })

  it('does not re-append a hedge note that is already on the body', () => {
    const finding = makeFinding({
      body: `No blocking issue here on re-examination.\n\n${HEDGE_NOTE}`,
    })
    const [out] = applyFindingQualityFilters([finding], makeContext(), ON)
    expect(out.severity).toBe('SUGGESTION')
    expect(out.confidence).toBe(QUALITY_ADJUSTED_CONFIDENCE_CAP)
    expect(out.body.split(HEDGE_NOTE)).toHaveLength(2)
  })
})

describe('applyFindingQualityFilters — env bypass', () => {
  it('returns findings unchanged when FINDING_QUALITY_FILTER=OFF', () => {
    const ath16 = makeFinding({
      body: 'No blocking issue here on re-examination.',
    })
    const [out] = applyFindingQualityFilters([ath16], makeContext(), OFF)
    expect(out.severity).toBe('BLOCKING')
    expect(out.body).not.toContain(HEDGE_NOTE)
  })

  it('reads process.env when prepare/apply are called without an env bag', () => {
    const prev = process.env[FINDING_QUALITY_FILTER_ENV]
    delete process.env[FINDING_QUALITY_FILTER_ENV]
    try {
      const prepared = prepareFindingsForMerge([
        makeResult('CORRECTNESS', [
          makeFinding({ id: 'keep', confidence: 0.8 }),
        ]),
      ])
      expect(prepared[0].findings).toHaveLength(1)
      const out = applyFindingQualityFilters(
        [makeFinding({ body: 'Null deref on the error path.' })],
        makeContext()
      )
      expect(out[0].severity).toBe('BLOCKING')
    } finally {
      if (prev === undefined) {
        delete process.env[FINDING_QUALITY_FILTER_ENV]
      } else {
        process.env[FINDING_QUALITY_FILTER_ENV] = prev
      }
    }
  })
})

describe('confidence constants', () => {
  it('keeps 0.7 as the prompt / future-slider floor', () => {
    expect(MIN_FINDING_CONFIDENCE).toBe(0.7)
  })

  it('caps quality-adjusted findings at 0.65, under the 0.7 floor', () => {
    expect(QUALITY_ADJUSTED_CONFIDENCE_CAP).toBe(0.65)
    expect(QUALITY_ADJUSTED_CONFIDENCE_CAP).toBeLessThan(MIN_FINDING_CONFIDENCE)
  })
})

describe('defaultFindingAccepted', () => {
  it('leaves BLOCKING and SUGGESTION checked at the 0.7 floor', () => {
    expect(
      defaultFindingAccepted(
        makeFinding({ severity: 'BLOCKING', confidence: 0.7 })
      )
    ).toBe(true)
    expect(
      defaultFindingAccepted(
        makeFinding({ severity: 'SUGGESTION', confidence: 0.85 })
      )
    ).toBe(true)
  })

  it('unchecks BLOCKING and SUGGESTION below 0.7, including the 0.65 quality cap', () => {
    expect(
      defaultFindingAccepted(
        makeFinding({
          severity: 'BLOCKING',
          confidence: QUALITY_ADJUSTED_CONFIDENCE_CAP,
        })
      )
    ).toBe(false)
    expect(
      defaultFindingAccepted(
        makeFinding({ severity: 'SUGGESTION', confidence: 0.69 })
      )
    ).toBe(false)
  })

  it('keeps NITs unchecked even when confidence is high', () => {
    expect(
      defaultFindingAccepted(makeFinding({ severity: 'NIT', confidence: 0.9 }))
    ).toBe(false)
  })
})
