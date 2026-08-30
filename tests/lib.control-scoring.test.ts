import {
  findingCoversPlant,
  formatPlantMatrix,
  formatScoreReport,
  formatScoreTable,
  matchesFiles,
  matchesSignals,
  scoreRun,
  scoreRuns,
  type ControlFinding,
  type ControlPlant,
  type ControlRun,
  type ControlSpec,
} from '../src/lib/control-scoring'

// Synthetic plants — the real ATH-43 answer key stays out of the repo.
const WIDGET = 'app/components/Widget.tsx'
const HELPER = 'src/lib/helper.ts'

const plant = (over: Partial<ControlPlant> = {}): ControlPlant => ({
  id: 'P1',
  label: 'off-by-one',
  files: [WIDGET],
  category: 'CORRECTNESS',
  signals: [['off-by-one']],
  ...over,
})

const finding = (over: Partial<ControlFinding> = {}): ControlFinding => ({
  severity: 'BLOCKING',
  category: 'CORRECTNESS',
  file: WIDGET,
  title: 'off-by-one in the loop',
  ...over,
})

const spec = (over: Partial<ControlSpec> = {}): ControlSpec => ({
  plants: [plant()],
  ...over,
})

const run = (findings: ControlFinding[], round = 1): ControlRun => ({
  round,
  id: `review-${round}`,
  findings,
})

describe('matchesFiles', () => {
  it('matches everything when the plant declares no files', () => {
    expect(matchesFiles(WIDGET, [])).toBe(true)
  })

  it('matches when the finding has no file at all', () => {
    expect(matchesFiles(undefined, [WIDGET])).toBe(true)
  })

  it('matches a finding path that is a suffix of the plant path', () => {
    expect(matchesFiles('components/Widget.tsx', [WIDGET])).toBe(true)
  })

  it('matches a plant path that is a suffix of the finding path', () => {
    expect(matchesFiles(WIDGET, ['components/Widget.tsx'])).toBe(true)
  })

  it('ignores leading ./ and slashes and is case-insensitive', () => {
    expect(matchesFiles('./App/Components/Widget.tsx', [WIDGET])).toBe(true)
    expect(matchesFiles('/app/components/Widget.tsx', [WIDGET])).toBe(true)
  })

  it('rejects an unrelated file', () => {
    expect(matchesFiles(HELPER, [WIDGET])).toBe(false)
  })
})

describe('matchesSignals', () => {
  it('is false when there are no signal groups', () => {
    expect(matchesSignals('anything', [])).toBe(false)
  })

  it('requires every group to contribute a match (AND)', () => {
    expect(matchesSignals('alpha only', [['alpha'], ['beta']])).toBe(false)
    expect(matchesSignals('alpha and beta', [['alpha'], ['beta']])).toBe(true)
  })

  it('accepts any alternative within a group (OR)', () => {
    expect(matchesSignals('beta', [['alpha', 'beta']])).toBe(true)
  })

  it('lowercases the alternatives before comparing', () => {
    expect(matchesSignals('has n+1 problem', [['N+1']])).toBe(true)
  })
})

describe('findingCoversPlant', () => {
  it('requires both the file and the signals to match', () => {
    expect(findingCoversPlant(finding(), plant())).toBe(true)
    expect(findingCoversPlant(finding({ file: HELPER }), plant())).toBe(false)
    expect(findingCoversPlant(finding({ title: 'unrelated' }), plant())).toBe(
      false
    )
  })

  it('searches the body and suggestedFix, not just the title', () => {
    const p = plant({ signals: [['off-by-one']] })
    expect(
      findingCoversPlant(
        finding({ title: 'loop bug', body: 'this is an off-by-one' }),
        p
      )
    ).toBe(true)
    expect(
      findingCoversPlant(
        finding({ title: 'loop bug', suggestedFix: 'fix the off-by-one' }),
        p
      )
    ).toBe(true)
  })
})

describe('scoreRun', () => {
  it('scores a clean single catch', () => {
    const score = scoreRun(run([finding()]), spec())
    expect(score.plantsCaught).toBe(1)
    expect(score.plantsTotal).toBe(1)
    expect(score.recall).toBe(1)
    expect(score.duplicationFactor).toBe(1)
    expect(score.maxDuplicates).toBe(1)
    expect(score.categoryOwnedCount).toBe(1)
    expect(score.offPlantFindings).toBe(0)
    expect(score.blockingCount).toBe(1)
  })

  it('reports a miss with zero duplication rather than dividing by zero', () => {
    const score = scoreRun(run([finding({ title: 'unrelated' })]), spec())
    expect(score.plantsCaught).toBe(0)
    expect(score.recall).toBe(0)
    expect(score.duplicationFactor).toBe(0)
    expect(score.maxDuplicates).toBe(0)
    expect(score.offPlantFindings).toBe(1)
  })

  it('counts duplicate coverage of one plant as duplication, not extra recall', () => {
    const score = scoreRun(
      run([
        finding(),
        finding({ title: 'the off-by-one again', category: 'STYLE' }),
        finding({ title: 'still the off-by-one', category: 'SECURITY' }),
      ]),
      spec()
    )
    expect(score.plantsCaught).toBe(1)
    expect(score.duplicationFactor).toBe(3)
    expect(score.maxDuplicates).toBe(3)
    expect(score.offPlantFindings).toBe(0)
  })

  it('marks the plant unowned when no covering finding used the intended category', () => {
    const score = scoreRun(
      run([finding({ category: 'STYLE' })]),
      spec({ plants: [plant({ category: 'PERFORMANCE' })] })
    )
    expect(score.plantsCaught).toBe(1)
    expect(score.categoryOwnedCount).toBe(0)
    expect(score.plants[0].observedCategories).toEqual(['STYLE'])
  })

  it('counts the plant as owned when any covering finding used the intended category', () => {
    const score = scoreRun(
      run([
        finding({ category: 'STYLE' }),
        finding({ category: 'CORRECTNESS' }),
      ]),
      spec()
    )
    expect(score.categoryOwnedCount).toBe(1)
    expect(score.plants[0].observedCategories).toEqual(['STYLE', 'CORRECTNESS'])
  })

  it('normalizes category casing and tolerates a missing category', () => {
    const score = scoreRun(
      run([
        finding({ category: 'correctness' }),
        finding({ category: undefined }),
      ]),
      spec()
    )
    expect(score.categoryOwnedCount).toBe(1)
    expect(score.plants[0].observedCategories).toEqual(['CORRECTNESS'])
  })

  it('excludes bonus plants from recall but still tracks them', () => {
    const score = scoreRun(
      run([finding()]),
      spec({
        plants: [
          plant(),
          plant({
            id: 'P2',
            label: 'bonus one',
            bonus: true,
            signals: [['zzz']],
          }),
        ],
      })
    )
    expect(score.plantsTotal).toBe(1)
    expect(score.recall).toBe(1)
    expect(score.bonusTotal).toBe(1)
    expect(score.bonusCaught).toBe(0)
  })

  it('keeps confounds out of the off-plant count', () => {
    const score = scoreRun(
      run([finding({ title: 'ticket wants all four variants' })]),
      spec({
        confounds: [
          { id: 'C1', label: 'stale AC', signals: [['all four variants']] },
        ],
      })
    )
    expect(score.confoundFindings).toBe(1)
    expect(score.offPlantFindings).toBe(0)
  })

  it('honours a file restriction on a confound', () => {
    const confounds = [
      {
        id: 'C1',
        label: 'scoped',
        files: [HELPER],
        signals: [['all four variants']],
      },
    ]
    const noisy = finding({ title: 'ticket wants all four variants' })
    expect(scoreRun(run([noisy]), spec({ confounds })).confoundFindings).toBe(0)
    expect(
      scoreRun(run([{ ...noisy, file: HELPER }]), spec({ confounds }))
        .confoundFindings
    ).toBe(1)
  })

  it('prefers a plant over a confound when a finding could match both', () => {
    const score = scoreRun(
      run([finding()]),
      spec({
        confounds: [{ id: 'C1', label: 'overlap', signals: [['off-by-one']] }],
      })
    )
    expect(score.plantsCaught).toBe(1)
    expect(score.confoundFindings).toBe(0)
    expect(score.offPlantFindings).toBe(0)
  })

  it('counts BLOCKING case-insensitively and tolerates a missing severity', () => {
    const score = scoreRun(
      run([
        finding({ severity: 'blocking' }),
        finding({ severity: undefined }),
        finding({ severity: 'NIT' }),
      ]),
      spec()
    )
    expect(score.blockingCount).toBe(1)
  })

  it('returns zero recall for a spec with no scored plants', () => {
    const score = scoreRun(run([finding()]), spec({ plants: [] }))
    expect(score.recall).toBe(0)
    expect(score.offPlantFindings).toBe(1)
  })

  it('defaults a missing review id to an empty string', () => {
    const score = scoreRun({ round: 2, findings: [] }, spec())
    expect(score.reviewId).toBe('')
  })
})

describe('scoreRuns', () => {
  it('sorts by round without mutating the input', () => {
    const runs = [run([], 3), run([], 1), run([], 2)]
    expect(scoreRuns(runs, spec()).map(s => s.round)).toEqual([1, 2, 3])
    expect(runs.map(r => r.round)).toEqual([3, 1, 2])
  })
})

describe('reporting', () => {
  const reportSpec = spec({
    plants: [
      plant(),
      plant({
        id: 'P2',
        label: 'slow scan',
        category: 'PERFORMANCE',
        signals: [['slow scan']],
      }),
      plant({ id: 'P3', label: 'extra', bonus: true, signals: [['never']] }),
    ],
  })
  const scores = scoreRuns(
    [
      run(
        [finding(), finding({ title: 'the slow scan', category: 'STYLE' })],
        1
      ),
      run([finding({ title: 'nothing relevant here' })], 2),
    ],
    reportSpec
  )

  it('emits one table row per run', () => {
    const table = formatScoreTable(scores)
    expect(table).toContain(
      '| R1 | 2 | 2 | 2/2 | 0/1 | 1/2 | 1.00 | 1 | 0 | 0 |'
    )
    expect(table).toContain(
      '| R2 | 1 | 1 | 0/2 | 0/1 | 0/2 | 0.00 | 0 | 1 | 0 |'
    )
  })

  it('marks misses, wrong owners, and duplicate counts in the matrix', () => {
    const matrix = formatPlantMatrix(scores, reportSpec)
    expect(matrix).toContain('| P1 off-by-one | CORRECTNESS | 1 | - |')
    expect(matrix).toContain('| P2 slow scan | PERFORMANCE | ~1 | - |')
    expect(matrix).toContain('| P3 extra (bonus) | CORRECTNESS | - | - |')
    expect(matrix).toContain('| R1 | R2 |')
  })

  it('combines both tables into one report', () => {
    const report = formatScoreReport(scores, reportSpec)
    expect(report).toContain('## Per-run scores')
    expect(report).toContain('## Plant coverage')
  })
})
