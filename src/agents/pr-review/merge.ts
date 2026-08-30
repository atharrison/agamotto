import type { DomainResult, Finding } from './schema'

const SEVERITY_ORDER: Record<Finding['severity'], number> = {
  BLOCKING: 0,
  SUGGESTION: 1,
  NIT: 2,
}

/**
 * Precedence for choosing whose write-up survives a merge (ATH-50).
 *
 * Merging keeps every agent's attribution but only one title and body, so this
 * decides which explanation the human reads. Confidence is a poor arbiter —
 * it is the agent's opinion of itself, and the control runs include an invented
 * syntax error asserted at 0.9 — whereas domain fit is deterministic and
 * testable. Specialists outrank the catch-alls: CORRECTNESS and STYLE will
 * comment on anything, so they yield to an agent whose whole remit is the
 * defect at hand.
 */
const DOMAIN_PRECEDENCE: Record<Finding['category'], number> = {
  SECURITY: 0,
  PERFORMANCE: 1,
  CONVENTIONS: 2,
  CORRECTNESS: 3,
  STYLE: 4,
}

/** Title word overlap required to call two findings the same defect. */
const TITLE_OVERLAP_THRESHOLD = 0.5

/**
 * Relaxed threshold when both findings name the same rare code identifier.
 * Paraphrases of one defect ("hardcoded credential exported and sent over the
 * network" vs "hard-coded secret exported from a library module") share very
 * few title words but always name the symbol. Relaxing rather than replacing
 * the title check matters: two genuinely different defects can sit on adjacent
 * lines and mention the same symbol, and collapsing those loses a finding.
 */
const IDENTIFIER_TITLE_OVERLAP_THRESHOLD = 0.2

/**
 * CONSTANT_CASE and camelCase symbols. PascalCase is deliberately excluded —
 * component and type names appear in nearly every finding about a file, so they
 * carry no signal about whether two findings describe the same defect.
 */
const IDENTIFIER_PATTERN =
  /\b(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+)\b/g

/**
 * Merges findings from multiple domain agent results into a single sorted,
 * deduplicated list.
 *
 * Dedup strategy: two findings are considered duplicates when they share the
 * same file AND their lines are within 3 of each other AND their titles share
 * enough words — > 50% normally, or > 20% when both findings name the same rare
 * code identifier. The surviving finding is chosen by domain precedence, then
 * confidence; its severity and confidence take the strongest claim of the pair.
 *
 * Calibration: findings not corroborated by a second agent have their
 * confidence slightly penalised (×0.9) to reflect that a single agent may
 * overstate severity.
 *
 * Sort order: BLOCKING → SUGGESTION → NIT, then by confidence desc.
 */
export function mergeResults(results: DomainResult[]): Finding[] {
  // Flatten all findings
  const all: Finding[] = results.flatMap(r => r.findings)

  const identifiers = all.map(extractIdentifiers)

  // Track which findings have been corroborated by another finding
  const corroborated = new Set<string>()
  const merged: Finding[] = []
  const seen = new Set<string>()

  for (let i = 0; i < all.length; i++) {
    if (seen.has(all[i].id)) continue

    let winner = all[i]
    // Grows as duplicates fold in, so a third paraphrase can match on a symbol
    // the second one contributed.
    let winnerIds = identifiers[i]

    for (let j = i + 1; j < all.length; j++) {
      if (seen.has(all[j].id)) continue
      const shared = sharesIdentifier(winnerIds, identifiers[j])
      if (!isDuplicate(winner, all[j], shared)) continue

      // Duplicate found — merge
      // Both ids go into corroborated before the winner reassignment, so
      // whichever id preferredWinner picks as the surviving title/body, it
      // is already in the set. The add after reassignment is defensive: it
      // covers the case where winner's id changed identity inside the spread,
      // making the intent explicit regardless of object identity.
      corroborated.add(winner.id)
      corroborated.add(all[j].id)
      seen.add(all[j].id)

      // The specialist's write-up survives; severity, confidence, and
      // attribution take the strongest claim across both agents.
      winner = {
        ...preferredWinner(winner, all[j]),
        severity: moreSevere(winner.severity, all[j].severity),
        confidence: Math.max(winner.confidence, all[j].confidence),
        categories: mergeCategories(winner, all[j]),
      }
      corroborated.add(winner.id)
      winnerIds = new Set([...winnerIds, ...identifiers[j]])
    }

    seen.add(winner.id)
    merged.push(winner)
  }

  // Apply confidence calibration for uncorroborated findings. Solo findings
  // still get an attribution list so consumers never special-case the shape.
  const calibrated = merged.map(f => ({
    ...f,
    categories: f.categories ?? [f.category],
    confidence: corroborated.has(f.id) ? f.confidence : f.confidence * 0.9,
  }))

  // Sort: severity asc (BLOCKING=0), then confidence desc
  return calibrated.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return b.confidence - a.confidence
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDuplicate(
  a: Finding,
  b: Finding,
  sharesIdentifier: boolean
): boolean {
  if (a.file !== b.file) return false

  // Line proximity (within 3 lines, or both file-level)
  const aLine = a.line ?? -1
  const bLine = b.line ?? -1
  if (aLine !== -1 && bLine !== -1 && Math.abs(aLine - bLine) > 3) return false

  const threshold = sharesIdentifier
    ? IDENTIFIER_TITLE_OVERLAP_THRESHOLD
    : TITLE_OVERLAP_THRESHOLD
  return titleOverlap(a.title, b.title) > threshold
}

/** Code symbols named anywhere in a finding's prose. */
export function extractIdentifiers(finding: Finding): Set<string> {
  const text = [finding.title, finding.body, finding.suggestedFix]
    .filter(Boolean)
    .join('\n')
  return new Set(text.match(IDENTIFIER_PATTERN) ?? [])
}

function sharesIdentifier(a: Set<string>, b: Set<string>): boolean {
  for (const id of a) {
    if (b.has(id)) return true
  }
  return false
}

/**
 * Union of both findings' attributions, order preserved so the first agent to
 * raise the defect stays first.
 */
function mergeCategories(a: Finding, b: Finding): Finding['category'][] {
  const all = [
    ...(a.categories ?? [a.category]),
    ...(b.categories ?? [b.category]),
  ]
  return [...new Set(all)]
}

/**
 * Which of two merged findings survives. Domain precedence first so the body
 * comes from the agent that owns the defect; confidence only breaks ties
 * within a domain.
 */
function preferredWinner(a: Finding, b: Finding): Finding {
  const aRank = DOMAIN_PRECEDENCE[a.category]
  const bRank = DOMAIN_PRECEDENCE[b.category]
  if (aRank !== bRank) return aRank < bRank ? a : b
  return b.confidence > a.confidence ? b : a
}

function titleOverlap(a: string, b: string): number {
  const wordsA = tokenize(a)
  const setB = new Set(tokenize(b))
  if (wordsA.length === 0 || setB.size === 0) return 0
  const setA = new Set(wordsA)
  const intersection = wordsA.filter(w => setB.has(w)).length
  return intersection / Math.max(setA.size, setB.size)
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function moreSevere(
  a: Finding['severity'],
  b: Finding['severity']
): Finding['severity'] {
  return SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b
}

/**
 * Split a merged finding list into the three buckets PRReview uses.
 */
export function bucketFindings(findings: Finding[]): {
  blockingIssues: Finding[]
  suggestions: Finding[]
  nits: Finding[]
} {
  return {
    blockingIssues: findings.filter(f => f.severity === 'BLOCKING'),
    suggestions: findings.filter(f => f.severity === 'SUGGESTION'),
    nits: findings.filter(f => f.severity === 'NIT'),
  }
}
