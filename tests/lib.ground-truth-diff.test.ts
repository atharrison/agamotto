import {
  DEFAULT_DIFF_MAX_BYTES,
  FILE_PATCH_MAX_BYTES,
  assembleGroundTruthDiff,
  formatGroundTruthActivity,
  truncatePatch,
  type RawPrFile,
} from '../src/lib/ground-truth-diff'

const file = (over: Partial<RawPrFile> = {}): RawPrFile => ({
  filename: 'src/foo.ts',
  status: 'modified',
  additions: 1,
  deletions: 0,
  patch: '@@ -1 +1 @@\n-old\n+new',
  ...over,
})

describe('truncatePatch', () => {
  it('leaves a patch under the cap untouched', () => {
    const result = truncatePatch('short patch', 100)
    expect(result).toEqual({
      text: 'short patch',
      truncated: false,
      omittedBytes: 0,
    })
  })

  it('leaves a patch exactly at the cap untouched', () => {
    expect(truncatePatch('12345', 5).truncated).toBe(false)
  })

  it('cuts at the cap and records how much was dropped', () => {
    const result = truncatePatch('0123456789', 4)
    expect(result.truncated).toBe(true)
    expect(result.omittedBytes).toBe(6)
    expect(result.text).toContain('0123')
    expect(result.text).not.toContain('456789')
  })

  it('leaves the marker the ATH-39 truncation rules look for', () => {
    expect(truncatePatch('0123456789', 4).text).toContain('[patch truncated')
  })

  it('defaults to the per-file cap', () => {
    const big = 'x'.repeat(FILE_PATCH_MAX_BYTES + 10)
    expect(truncatePatch(big).omittedBytes).toBe(10)
  })
})

describe('assembleGroundTruthDiff', () => {
  it('returns an empty result for no files', () => {
    expect(assembleGroundTruthDiff([])).toEqual({
      diff: '',
      filesChanged: [],
      fileCoverage: [],
    })
  })

  it('emits a git header per file so paths are unambiguous', () => {
    const { diff } = assembleGroundTruthDiff([file()])
    expect(diff).toContain('diff --git a/src/foo.ts b/src/foo.ts')
    expect(diff).toContain('+new')
  })

  it('marks a fully included file READ with its line counts', () => {
    const { fileCoverage } = assembleGroundTruthDiff([file()])
    expect(fileCoverage).toEqual([
      { file: 'src/foo.ts', status: 'READ', linesRead: 3, linesTotal: 3 },
    ])
  })

  it('lists every changed file, including ones it could not show', () => {
    const { filesChanged } = assembleGroundTruthDiff([
      file({ filename: 'a.ts' }),
      file({ filename: 'logo.png', patch: undefined }),
    ])
    expect(filesChanged).toEqual(['a.ts', 'logo.png'])
  })

  it('marks a file GitHub returned no patch for as SKIPPED', () => {
    const { fileCoverage, diff } = assembleGroundTruthDiff([
      file({ filename: 'logo.png', patch: undefined }),
    ])
    expect(fileCoverage[0].status).toBe('SKIPPED')
    expect(fileCoverage[0].reason).toContain('no patch')
    expect(diff).toBe('')
  })

  it('marks an over-cap file TRUNCATED rather than claiming it was read', () => {
    const { fileCoverage, diff } = assembleGroundTruthDiff(
      [file({ patch: 'x'.repeat(200) })],
      { filePatchMaxBytes: 50 }
    )
    expect(fileCoverage[0].status).toBe('TRUNCATED')
    expect(fileCoverage[0].reason).toContain('150 bytes omitted')
    expect(diff).toContain('[patch truncated')
  })

  it('reports lines read against lines total on a truncated file', () => {
    const patch = Array.from({ length: 20 }, (_, i) => `+line ${i}`).join('\n')
    const [coverage] = assembleGroundTruthDiff([file({ patch })], {
      filePatchMaxBytes: 30,
    }).fileCoverage
    expect(coverage.linesTotal).toBe(20)
    expect(coverage.linesRead).toBeLessThan(20)
  })

  it('stops spending the whole-diff budget and skips the remainder', () => {
    const files = [
      file({ filename: 'a.ts', patch: 'a'.repeat(900) }),
      file({ filename: 'b.ts', patch: 'b'.repeat(900) }),
      file({ filename: 'c.ts', patch: 'c'.repeat(900) }),
    ]
    const { fileCoverage, diff } = assembleGroundTruthDiff(files, {
      diffMaxBytes: 1000,
    })
    expect(fileCoverage[0].status).toBe('READ')
    expect(fileCoverage[2].status).toBe('SKIPPED')
    expect(fileCoverage[2].reason).toContain('budget')
    expect(diff).not.toContain('ccc')
  })

  it('truncates a file to the tail of the budget rather than overshooting it', () => {
    const files = [
      file({ filename: 'a.ts', patch: 'a'.repeat(600) }),
      file({ filename: 'b.ts', patch: 'b'.repeat(5000) }),
    ]
    const { fileCoverage } = assembleGroundTruthDiff(files, {
      diffMaxBytes: 2000,
    })
    expect(fileCoverage[1].status).toBe('TRUNCATED')
  })

  it('still records skipped files in filesChanged so nothing disappears', () => {
    const files = [
      file({ filename: 'a.ts', patch: 'a'.repeat(2000) }),
      file({ filename: 'b.ts', patch: 'b'.repeat(2000) }),
    ]
    const result = assembleGroundTruthDiff(files, { diffMaxBytes: 1200 })
    expect(result.filesChanged).toEqual(['a.ts', 'b.ts'])
    expect(result.fileCoverage).toHaveLength(2)
  })

  it('uses the documented defaults when no options are given', () => {
    const patch = 'x'.repeat(DEFAULT_DIFF_MAX_BYTES + 1)
    const [coverage] = assembleGroundTruthDiff([file({ patch })]).fileCoverage
    // Per-file cap bites first, well below the whole-diff budget.
    expect(coverage.status).toBe('TRUNCATED')
    expect(coverage.linesTotal).toBe(1)
  })
})

describe('formatGroundTruthActivity', () => {
  it('reports a plain file count when everything was read', () => {
    const result = assembleGroundTruthDiff([file()])
    expect(formatGroundTruthActivity(result)).toBe(
      '📄 Diff loaded from GitHub (1 files)'
    )
  })

  it('calls out truncated and skipped files', () => {
    const result = assembleGroundTruthDiff(
      [
        file({ filename: 'a.ts', patch: 'a'.repeat(4000) }),
        file({ filename: 'logo.png', patch: undefined }),
      ],
      { filePatchMaxBytes: 100 }
    )
    expect(formatGroundTruthActivity(result)).toBe(
      '📄 Diff loaded from GitHub (2 files, 1 truncated, 1 skipped)'
    )
  })
})
