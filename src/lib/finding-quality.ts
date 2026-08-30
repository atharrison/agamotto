/**
 * Post-merge finding quality (ATH-35 hedging + ATH-39 truncation grounding).
 *
 * Domain agents still emit JSON as-is. This module is the deterministic
 * backstop before findings reach the approval UI and the coordinator summary.
 * Disable with FINDING_QUALITY_FILTER=OFF (lowercase accepted at the boundary).
 */

import type {
  DomainResult,
  EnrichedContext,
  Finding,
} from '../agents/pr-review/schema'

export enum FindingQualityFilter {
  ON = 'ON',
  OFF = 'OFF',
}

export const FINDING_QUALITY_FILTER_ENV = 'FINDING_QUALITY_FILTER'

/** Prompt skip line and future slider default. Not a drop threshold. */
export const MIN_FINDING_CONFIDENCE = 0.7

/**
 * Cap for findings the quality filter downgraded (hedge, truncation, ungrounded).
 * Sits under MIN_FINDING_CONFIDENCE so a 0.7 slider would hide them.
 */
export const QUALITY_ADJUSTED_CONFIDENCE_CAP = 0.65

/**
 * Default checkbox for the approval UI. NITs stay off; anything under the
 * prompt floor starts unchecked so a human must opt in.
 */
export function defaultFindingAccepted(finding: {
  severity: Finding['severity']
  confidence: number
}): boolean {
  if (finding.severity === 'NIT') return false
  return finding.confidence >= MIN_FINDING_CONFIDENCE
}

export const HEDGE_NOTE = '*(severity auto-adjusted: rationale hedged)*'
export const TITLE_BODY_NOTE =
  '*(title/body inconsistency — verify suggested fix before acting)*'
export const TRUNCATED_FILE_NOTE =
  '*(severity auto-adjusted: cited file was truncated)*'
export const INCOMPLETE_CONTEXT_NOTE =
  '*(severity auto-adjusted: could not verify from incomplete context)*'
export const UNGROUNDED_NOTE =
  '*(severity auto-adjusted: cited text still present in the visible patch)*'

const PATCH_TRUNCATED_MARKER = '[patch truncated'

const HEDGE_RE =
  /not a blocking issue|no blocking issue|not actually blocking|upon further examination|on re-examination|on reflection|more of a suggestion|lower priority than initially stated|may not be necessary/i

const WITHDRAW_RE =
  /withdrawing this finding|omitting this finding|\bretracting\b/i

const CANNOT_CONFIRM_RE =
  /cannot confirm|could not verify|truncated diff|incomplete view|because truncated|file is truncated|incomplete context/i

const PLACEHOLDER_RE =
  /literal `\.\.\.`|\.\.\.\s*placeholders?|elided with `\.\.\.`|fail to compile/i

const DELETION_CLAIM_RE =
  /stripped|no longer includes|empty object|error key was|key was stripped/i

const MIN_GROUNDED_SNIPPET = 12

/**
 * Default ON. Only FINDING_QUALITY_FILTER=OFF (any case) disables the filter.
 */
export function isFindingQualityFilterEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const raw = env[FINDING_QUALITY_FILTER_ENV]?.trim().toUpperCase()
  if (!raw) return true
  return raw !== FindingQualityFilter.OFF
}

/**
 * Drop withdrawals before merge. Low-confidence findings still emit so a
 * later slider can show them; they already sit under MIN_FINDING_CONFIDENCE.
 */
export function prepareFindingsForMerge(
  results: DomainResult[],
  env: Record<string, string | undefined> = process.env
): DomainResult[] {
  if (!isFindingQualityFilterEnabled(env)) return results
  return results.map(r => ({
    ...r,
    findings: r.findings.filter(f => !isWithdrawal(f)),
  }))
}

/**
 * Hedge downgrade, title/body flag, and truncation grounding after merge.
 */
export function applyFindingQualityFilters(
  findings: Finding[],
  context: EnrichedContext,
  env: Record<string, string | undefined> = process.env
): Finding[] {
  if (!isFindingQualityFilterEnabled(env)) return findings
  return findings.flatMap(f => {
    if (isWithdrawal(f)) return []

    let next = f
    if (isHedge(next)) {
      next =
        next.severity === 'BLOCKING'
          ? markQualityAdjusted(next, HEDGE_NOTE)
          : capConfidence(next)
    }
    if (hasTitleBodyContradiction(next)) {
      next = { ...next, body: appendNote(next.body, TITLE_BODY_NOTE) }
    }
    return [applyGrounding(next, context)]
  })
}

function isWithdrawal(f: Finding): boolean {
  return WITHDRAW_RE.test(findingText(f))
}

function isHedge(f: Finding): boolean {
  return HEDGE_RE.test(findingText(f))
}

function findingText(f: Finding): string {
  return `${f.title}\n${f.body}`
}

function appendNote(body: string, note: string): string {
  if (body.includes(note)) return body
  return `${body}\n\n${note}`
}

function hasTitleBodyContradiction(f: Finding): boolean {
  const titleVals = booleanAssignments(f.title)
  const bodyVals = booleanAssignments(`${f.body}\n${f.suggestedFix ?? ''}`)
  for (const [key, titleBool] of titleVals) {
    const bodyBool = bodyVals.get(key)
    if (bodyBool !== undefined && bodyBool !== titleBool) return true
  }
  return false
}

function booleanAssignments(text: string): Map<string, boolean> {
  const map = new Map<string, boolean>()
  const re = /([A-Za-z_][\w.]*)\s*[=:]\s*(true|false)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    map.set(match[1].toLowerCase(), match[2].toLowerCase() === 'true')
  }
  return map
}

function capConfidence(f: Finding): Finding {
  return {
    ...f,
    confidence: Math.min(f.confidence, QUALITY_ADJUSTED_CONFIDENCE_CAP),
  }
}

function markQualityAdjusted(f: Finding, note: string): Finding {
  return capConfidence({
    ...f,
    severity: f.severity === 'BLOCKING' ? 'SUGGESTION' : f.severity,
    body: appendNote(f.body, note),
  })
}

function applyGrounding(finding: Finding, context: EnrichedContext): Finding {
  const truncated = isFileTruncated(finding.file, context)
  if (isPlaceholderClaim(finding) && truncated) {
    return markQualityAdjusted(finding, TRUNCATED_FILE_NOTE)
  }
  if (
    isDeletionClaim(finding) &&
    claimedSnippetStillPresent(finding, context)
  ) {
    return markQualityAdjusted(finding, UNGROUNDED_NOTE)
  }
  if (finding.severity !== 'BLOCKING') return finding
  if (CANNOT_CONFIRM_RE.test(findingText(finding))) {
    return markQualityAdjusted(finding, INCOMPLETE_CONTEXT_NOTE)
  }
  if (truncated) {
    return markQualityAdjusted(finding, TRUNCATED_FILE_NOTE)
  }
  return finding
}

function isPlaceholderClaim(f: Finding): boolean {
  return PLACEHOLDER_RE.test(findingText(f))
}

function isDeletionClaim(f: Finding): boolean {
  return DELETION_CLAIM_RE.test(findingText(f))
}

function isFileTruncated(file: string, context: EnrichedContext): boolean {
  if (
    context.fileCoverage.some(c => c.file === file && c.status === 'TRUNCATED')
  ) {
    return true
  }
  return (
    context.diff.includes(PATCH_TRUNCATED_MARKER) &&
    (context.diff.includes(file) || context.filesChanged.includes(file))
  )
}

function claimedSnippetStillPresent(
  finding: Finding,
  context: EnrichedContext
): boolean {
  const snippets = extractQuotedSnippets(findingText(finding))
  return snippets.some(snippet =>
    context.diff.split('\n').some(line => {
      if (line.startsWith('-')) return false
      return line.includes(snippet)
    })
  )
}

function extractQuotedSnippets(text: string): string[] {
  const out: string[] = []
  const patterns = [/`([^`]+)`/g, /'([^']+)'/g, /"([^"]+)"/g]
  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const snippet = match[1]
      if (snippet.length >= MIN_GROUNDED_SNIPPET) out.push(snippet)
    }
  }
  return out
}
