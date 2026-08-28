/**
 * Hydrate the review UI from a stored COMPLETE reviews.result.
 * Used when opening View Review so the page never looks like a live pipeline.
 */

export interface StoredFinding {
  id: string
  severity: 'BLOCKING' | 'SUGGESTION' | 'NIT'
  category: string
  file: string
  line?: number
  title: string
  body: string
  confidence: number
  suggestedFix?: string
}

export interface StoredReviewPayload {
  blockingIssues?: StoredFinding[]
  suggestions?: StoredFinding[]
  nits?: StoredFinding[]
}

export interface StoredReviewUiState {
  status: 'done'
  isCachedReview: true
  findings: StoredFinding[]
  decisions: Record<string, { findingId: string; accepted: boolean }>
  phaseStatuses: Record<'INPUT' | 'CONTEXT' | 'DOMAIN' | 'OUTPUT', 'done'>
  activity: { type: 'phase'; text: string }[]
}

export function storedReviewUiState(
  result: StoredReviewPayload | null | undefined
): StoredReviewUiState | null {
  if (result == null) return null

  const findings = [
    ...(result.blockingIssues ?? []),
    ...(result.suggestions ?? []),
    ...(result.nits ?? []),
  ]

  const decisions: StoredReviewUiState['decisions'] = {}
  for (const finding of findings) {
    decisions[finding.id] = {
      findingId: finding.id,
      accepted: finding.severity !== 'NIT',
    }
  }

  return {
    status: 'done',
    isCachedReview: true,
    findings,
    decisions,
    phaseStatuses: {
      INPUT: 'done',
      CONTEXT: 'done',
      DOMAIN: 'done',
      OUTPUT: 'done',
    },
    activity: [
      { type: 'phase', text: '⚡ Loaded saved review' },
      { type: 'phase', text: '🎉 Review complete' },
    ],
  }
}
