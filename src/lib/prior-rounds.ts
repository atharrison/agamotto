/**
 * Compact prior-round findings for injection into EnrichedContext.
 *
 * Rows arrive newest-first from listCompleteReviewsForPr; output is
 * chronological (oldest first) so domain agents see the progression.
 * Finding bodies are dropped — titles + file/line are enough to avoid
 * re-raising fixed issues without blowing the token budget.
 */

export const MAX_PRIOR_ROUNDS = 3

export enum PriorFindingAction {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
  EDIT = 'EDIT',
}

export interface CompleteReviewSource {
  id: string
  created_at: string
  result: unknown
  submission: unknown
}

export interface PriorFinding {
  severity: 'BLOCKING' | 'SUGGESTION' | 'NIT'
  category: 'STYLE' | 'CONVENTIONS' | 'CORRECTNESS' | 'SECURITY' | 'PERFORMANCE'
  file: string
  line?: number
  title: string
  action?: PriorFindingAction
}

export interface PriorRound {
  reviewId: string
  reviewedAt: string
  summary: string
  findings: PriorFinding[]
}

const SEVERITIES = new Set(['BLOCKING', 'SUGGESTION', 'NIT'])
const CATEGORIES = new Set([
  'STYLE',
  'CONVENTIONS',
  'CORRECTNESS',
  'SECURITY',
  'PERFORMANCE',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function isAction(value: unknown): value is PriorFindingAction {
  return (
    value === PriorFindingAction.ACCEPT ||
    value === PriorFindingAction.REJECT ||
    value === PriorFindingAction.EDIT
  )
}

function actionByFindingId(
  submission: unknown
): Map<string, PriorFindingAction> {
  const map = new Map<string, PriorFindingAction>()
  const rec = asRecord(submission)
  const decisions = rec?.decisions
  if (!Array.isArray(decisions)) return map
  for (const d of decisions) {
    const row = asRecord(d)
    if (!row) continue
    if (typeof row.findingId !== 'string' || !isAction(row.action)) continue
    map.set(row.findingId, row.action)
  }
  return map
}

function compactFinding(
  raw: unknown,
  actions: Map<string, PriorFindingAction>
): PriorFinding | null {
  const rec = asRecord(raw)
  if (!rec) return null
  if (typeof rec.title !== 'string' || rec.title.length === 0) return null
  if (typeof rec.file !== 'string' || rec.file.length === 0) return null
  if (typeof rec.severity !== 'string' || !SEVERITIES.has(rec.severity)) {
    return null
  }
  if (typeof rec.category !== 'string' || !CATEGORIES.has(rec.category)) {
    return null
  }

  const finding: PriorFinding = {
    severity: rec.severity as PriorFinding['severity'],
    category: rec.category as PriorFinding['category'],
    file: rec.file,
    title: rec.title,
  }
  if (
    typeof rec.line === 'number' &&
    Number.isInteger(rec.line) &&
    rec.line > 0
  ) {
    finding.line = rec.line
  }
  if (typeof rec.id === 'string') {
    const action = actions.get(rec.id)
    if (action) finding.action = action
  }
  return finding
}

function findingsFromResult(
  result: Record<string, unknown>,
  actions: Map<string, PriorFindingAction>
): PriorFinding[] {
  const buckets = [result.blockingIssues, result.suggestions, result.nits]
  const out: PriorFinding[] = []
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue
    for (const raw of bucket) {
      const compact = compactFinding(raw, actions)
      if (compact) out.push(compact)
    }
  }
  return out
}

function roundFromRow(row: CompleteReviewSource): PriorRound | null {
  const result = asRecord(row.result)
  if (!result) return null
  return {
    reviewId: row.id,
    reviewedAt: row.created_at,
    summary: typeof result.summary === 'string' ? result.summary : '',
    findings: findingsFromResult(result, actionByFindingId(row.submission)),
  }
}

/** Map COMPLETE review rows (newest-first) into chronological prior rounds. */
export function formatPriorRounds(rows: CompleteReviewSource[]): PriorRound[] {
  const chronological = [...rows].reverse()
  const rounds: PriorRound[] = []
  for (const row of chronological) {
    const round = roundFromRow(row)
    if (round) rounds.push(round)
  }
  return rounds
}
