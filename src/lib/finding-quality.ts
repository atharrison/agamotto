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
// Written by assembleGroundTruthDiff — shared so the sentinel the coordinator
// emits and the one these rules look for cannot drift apart.
import { hasTruncationMarker } from './ground-truth-diff'

/** Whether the post-merge finding quality filter is active. */
export enum FindingQualityFilter {
  ON = 'ON',
  OFF = 'OFF',
}

/** Env var that toggles the filter. Only `OFF` (any case) disables it. */
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

/** Appended when BLOCKING was downgraded because the rationale walked itself back. */
export const HEDGE_NOTE = '*(severity auto-adjusted: rationale hedged)*'
/** Appended when title and body disagree on a `field=true/false` assignment. */
export const TITLE_BODY_NOTE =
  '*(title/body inconsistency — verify suggested fix before acting)*'
/** Appended when the cited file was truncated in EnrichedContext. */
export const TRUNCATED_FILE_NOTE =
  '*(severity auto-adjusted: cited file was truncated)*'
/** Appended when the finding itself says it could not verify from incomplete context. */
export const INCOMPLETE_CONTEXT_NOTE =
  '*(severity auto-adjusted: could not verify from incomplete context)*'
/** Appended when a deletion claim quotes text that is still on a non-`-` patch line. */
export const UNGROUNDED_NOTE =
  '*(severity auto-adjusted: cited text still present in the visible patch)*'

/** ATH-16 walk-backs: severity label vs “not actually blocking.” */
const HEDGE_RE =
  /not a blocking issue|no blocking issue|not actually blocking|upon further examination|on re-examination|on reflection|more of a suggestion|lower priority than initially stated|may not be necessary/i

/** Explicit retract — drop, do not downgrade. */
const WITHDRAW_RE =
  /withdrawing this finding|omitting this finding|\bretracting\b/i

/** Agent abstained because the hunk was incomplete. */
const CANNOT_CONFIRM_RE =
  /cannot confirm|could not verify|truncated diff|incomplete view|because truncated|file is truncated|incomplete context/i

/** ATH-38 class: treating unified-diff `...` as source that will not compile. */
const PLACEHOLDER_RE =
  /literal `\.\.\.`|\.\.\.\s*placeholders?|elided with `\.\.\.`|fail to compile/i

/** ATH-15 class: indent hunk read as a semantic deletion. */
const DELETION_CLAIM_RE =
  /stripped|no longer includes|empty object|error key was|key was stripped/i

/** Quoted snippets shorter than this are too generic to ground against the patch. */
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
  // Pre-split once so isFileTruncated doesn't re-split for every finding.
  const diffSections = buildDiffSections(context.diff)
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
    return [applyGrounding(next, context, diffSections)]
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

function applyGrounding(
  finding: Finding,
  context: EnrichedContext,
  diffSections: Map<string, string>
): Finding {
  const truncated = isFileTruncated(finding.file, context, diffSections)
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

/**
 * Whether the finding's file reached the agents incomplete.
 *
 * Coverage is checked first, then the file's own diff section — scoped, so a
 * truncation elsewhere in a large PR no longer taints findings on files that
 * were shown in full. Only when the path has no section at all do we fall back
 * to the whole diff, because then the agent is citing bytes we never sent.
 *
 * `diffSections` is pre-computed once per filter pass; call `buildDiffSections`
 * before iterating findings to avoid re-splitting the full diff per finding.
 */
function isFileTruncated(
  file: string,
  context: EnrichedContext,
  diffSections: Map<string, string>
): boolean {
  if (
    context.fileCoverage.some(c => c.file === file && c.status === 'TRUNCATED')
  ) {
    return true
  }
  const section = diffSections.get(file) ?? null
  if (section !== null) return hasTruncationMarker(section)
  return (
    hasTruncationMarker(context.diff) && context.filesChanged.includes(file)
  )
}

/**
 * Split the assembled diff into a map of filename → section body.
 * Called once per filter pass so per-finding truncation checks are O(1) lookups.
 */
function buildDiffSections(diff: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const section of diff.split(/^diff --git /m)) {
    if (!section) continue
    const newlineIdx = section.indexOf('\n')
    const header = newlineIdx === -1 ? section : section.slice(0, newlineIdx)
    // Header is `a/path b/path` — extract from the b/ side as the canonical name
    const bMatch = header.match(/\s+b\/(.+)$/)
    if (bMatch) map.set(bMatch[1], section)
  }
  return map
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
