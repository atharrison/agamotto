/**
 * Scoring for control-PR review runs (ATH-50).
 *
 * A "control PR" is a branch with a known set of planted defects. Reviewing it
 * repeatedly and scoring each run against the plant list turns review quality
 * from prose into numbers we can compare across pipeline changes.
 *
 * The plant list is deliberately NOT hard-coded here. It is supplied as a
 * `ControlSpec` loaded from a file outside version control, so the answer key
 * never lands in the repo — Agamotto reviews its own PRs and ATH-32 injects
 * GitHub conversation, so a committed answer key would leak into later runs.
 *
 * Recall alone is a poor target once it saturates. The metrics that matter are
 * duplication (how many findings one defect produces), category ownership (did
 * the intended agent claim it), and off-plant volume (the precision proxy).
 */

import type { Finding } from '../agents/pr-review/schema'

/** Intended owner of a plant. Same five domains the pipeline emits. */
export type ControlCategory = Finding['category']

/**
 * Text signals that identify a finding as covering a plant.
 *
 * Outer array is AND, inner arrays are OR: every group must contribute at least
 * one matching alternative. `[['off-by-one', '<= bars'], ['segment', 'bar']]`
 * means "mentions the off-by-one somehow AND mentions segments somehow".
 */
export type SignalGroups = string[][]

export interface ControlPlant {
  /** Stable short id used as the column key in the matrix, e.g. `P1`, `P3B`. */
  id: string
  label: string
  /** Repo-relative paths the plant lives in. A finding may cite any of them. */
  files: string[]
  /** The agent that should own this finding. */
  category: ControlCategory
  signals: SignalGroups
  /**
   * Tracked but excluded from the recall denominator — a defect we are happy to
   * catch but did not commit to catching, so it cannot quietly move the score.
   */
  bonus?: boolean
}

/**
 * A finding shape that is expected but is neither a plant nor a false positive
 * — e.g. a stale ticket acceptance criterion the PR deliberately does not meet.
 * Excluded from the off-plant count so it does not pollute the precision proxy.
 */
export interface ControlConfound {
  id: string
  label: string
  files?: string[]
  signals: SignalGroups
}

export interface ControlSpec {
  prUrl?: string
  plants: ControlPlant[]
  confounds?: ControlConfound[]
}

/**
 * Minimal finding shape read from a run dump. Intentionally looser than the
 * pipeline's `Finding` so historical dumps (which predate schema changes and
 * carry no `id`) still score.
 */
export interface ControlFinding {
  severity?: string
  /** Absent on runs recorded before multi-attribution (ATH-50). */
  categories?: string[]
  category?: string
  file?: string
  line?: number
  title?: string
  body?: string
  suggestedFix?: string
  confidence?: number
}

export interface ControlRun {
  round: number
  id?: string
  notes?: string
  findings: ControlFinding[]
}

export interface PlantScore {
  plantId: string
  bonus: boolean
  caught: boolean
  /** Findings covering this one plant. >1 means the UI showed duplicates. */
  matchCount: number
  /** True when at least one covering finding carried the intended category. */
  categoryOwned: boolean
  observedCategories: string[]
}

export interface RunScore {
  round: number
  reviewId: string
  totalFindings: number
  blockingCount: number
  plantsCaught: number
  plantsTotal: number
  /** plantsCaught / plantsTotal, 0–1. Bonus plants are excluded. */
  recall: number
  bonusCaught: number
  bonusTotal: number
  /** Mean findings per caught plant. 1.0 is ideal; 2.5 means heavy duplication. */
  duplicationFactor: number
  maxDuplicates: number
  categoryOwnedCount: number
  confoundFindings: number
  /** Findings covering no plant and no confound — the precision proxy. */
  offPlantFindings: number
  plants: PlantScore[]
}

const BLOCKING: Finding['severity'] = 'BLOCKING'

// ── Matching ──────────────────────────────────────────────────────────────────

function normalizeText(finding: ControlFinding): string {
  return [finding.title, finding.body, finding.suggestedFix]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase()
}

/**
 * A finding cites a plant's file when its path ends with one of them. Suffix
 * matching tolerates agents that report `components/Foo.tsx` for
 * `app/components/Foo.tsx`. A finding with no file falls through to signals.
 */
export function matchesFiles(
  findingFile: string | undefined,
  files: string[]
): boolean {
  if (files.length === 0 || !findingFile) return true
  const actual = normalizePath(findingFile)
  return files.some(f => {
    const expected = normalizePath(f)
    return actual.endsWith(expected) || expected.endsWith(actual)
  })
}

export function matchesSignals(text: string, signals: SignalGroups): boolean {
  if (signals.length === 0) return false
  return signals.every(group =>
    group.some(alternative => text.includes(alternative.toLowerCase()))
  )
}

export function findingCoversPlant(
  finding: ControlFinding,
  plant: ControlPlant
): boolean {
  return (
    matchesFiles(finding.file, plant.files) &&
    matchesSignals(normalizeText(finding), plant.signals)
  )
}

function findingCoversConfound(
  finding: ControlFinding,
  confound: ControlConfound
): boolean {
  return (
    matchesFiles(finding.file, confound.files ?? []) &&
    matchesSignals(normalizeText(finding), confound.signals)
  )
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Every agent credited with a finding, upper-cased. Runs recorded before
 * multi-attribution carry a single `category`, so old and new dumps score on
 * the same basis and remain comparable.
 */
function attributedCategories(finding: ControlFinding): string[] {
  const raw = finding.categories?.length
    ? finding.categories
    : [finding.category ?? '']
  return raw.filter(Boolean).map(c => c.toUpperCase())
}

export function scoreRun(run: ControlRun, spec: ControlSpec): RunScore {
  const confounds = spec.confounds ?? []
  const matchedFindings = new Set<number>()

  const plants: PlantScore[] = spec.plants.map(plant => {
    const observedCategories: string[] = []
    let matchCount = 0

    run.findings.forEach((finding, index) => {
      if (!findingCoversPlant(finding, plant)) return
      matchedFindings.add(index)
      matchCount++
      for (const category of attributedCategories(finding)) {
        if (!observedCategories.includes(category)) {
          observedCategories.push(category)
        }
      }
    })

    return {
      plantId: plant.id,
      bonus: plant.bonus === true,
      caught: matchCount > 0,
      matchCount,
      categoryOwned: observedCategories.includes(plant.category),
      observedCategories,
    }
  })

  let confoundFindings = 0
  run.findings.forEach((finding, index) => {
    if (matchedFindings.has(index)) return
    if (confounds.some(c => findingCoversConfound(finding, c))) {
      matchedFindings.add(index)
      confoundFindings++
    }
  })

  const caught = plants.filter(p => p.caught)
  const totalMatches = caught.reduce((sum, p) => sum + p.matchCount, 0)
  const scored = plants.filter(p => !p.bonus)
  const scoredCaught = scored.filter(p => p.caught)
  const bonus = plants.filter(p => p.bonus)

  return {
    round: run.round,
    reviewId: run.id ?? '',
    totalFindings: run.findings.length,
    blockingCount: run.findings.filter(
      f => (f.severity ?? '').toUpperCase() === BLOCKING
    ).length,
    plantsCaught: scoredCaught.length,
    plantsTotal: scored.length,
    recall: scored.length === 0 ? 0 : scoredCaught.length / scored.length,
    bonusCaught: bonus.filter(p => p.caught).length,
    bonusTotal: bonus.length,
    duplicationFactor: caught.length === 0 ? 0 : totalMatches / caught.length,
    maxDuplicates: caught.reduce((max, p) => Math.max(max, p.matchCount), 0),
    categoryOwnedCount: scored.filter(p => p.categoryOwned).length,
    confoundFindings,
    offPlantFindings: run.findings.length - matchedFindings.size,
    plants,
  }
}

export function scoreRuns(runs: ControlRun[], spec: ControlSpec): RunScore[] {
  return [...runs]
    .sort((a, b) => a.round - b.round)
    .map(run => scoreRun(run, spec))
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function round2(n: number): string {
  return n.toFixed(2)
}

/** Per-run summary: one row per run, the numbers we compare across changes. */
export function formatScoreTable(scores: RunScore[]): string {
  const header =
    '| Run | Findings | BLOCKING | Recall | Bonus | Category owned | Dup factor | Max dup | Off-plant | Confound |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  const rows = scores.map(
    s =>
      `| R${s.round} | ${s.totalFindings} | ${s.blockingCount} | ` +
      `${s.plantsCaught}/${s.plantsTotal} | ${s.bonusCaught}/${s.bonusTotal} | ` +
      `${s.categoryOwnedCount}/${s.plantsTotal} | ` +
      `${round2(s.duplicationFactor)} | ${s.maxDuplicates} | ${s.offPlantFindings} | ${s.confoundFindings} |`
  )
  return [header, ...rows].join('\n')
}

/**
 * Plant × run grid. `-` missed, `~` caught by the wrong agent, `N` caught with
 * the intended category (N = how many findings covered it, so `3` is a catch
 * with two duplicates).
 */
export function formatPlantMatrix(
  scores: RunScore[],
  spec: ControlSpec
): string {
  const header = `| Plant | Owner | ${scores.map(s => `R${s.round}`).join(' | ')} |`
  const divider = `| --- | --- | ${scores.map(() => '---').join(' | ')} |`
  const rows = spec.plants.map(plant => {
    const cells = scores.map(score => {
      const p = score.plants.find(x => x.plantId === plant.id)
      if (!p || !p.caught) return '-'
      return p.categoryOwned ? String(p.matchCount) : `~${p.matchCount}`
    })
    const name = plant.bonus
      ? `${plant.id} ${plant.label} (bonus)`
      : `${plant.id} ${plant.label}`
    return `| ${name} | ${plant.category} | ${cells.join(' | ')} |`
  })
  return [header, divider, ...rows].join('\n')
}

export function formatScoreReport(
  scores: RunScore[],
  spec: ControlSpec
): string {
  return [
    '## Per-run scores',
    '',
    formatScoreTable(scores),
    '',
    '## Plant coverage',
    '',
    formatPlantMatrix(scores, spec),
    '',
    '`-` missed · `~N` caught by the wrong agent · `N` caught by the intended agent (N = findings covering it, so >1 is duplication)',
  ].join('\n')
}
