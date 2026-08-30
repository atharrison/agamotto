import {
  FindingSchema,
  FileCoverageSchema,
  EnrichedContextSchema,
  DomainResultSchema,
  PRReviewSchema,
  CheckpointRecordSchema,
} from '../src/agents/pr-review/schema'
import {
  GithubCommentKind,
  formatContextJsonForAgents,
} from '../src/lib/github-conversation'

// ── Finding ───────────────────────────────────────────────────────────────────

describe('FindingSchema', () => {
  const valid = {
    id: 'f1',
    severity: 'BLOCKING',
    category: 'CORRECTNESS',
    file: 'src/foo.ts',
    line: 42,
    title: 'Null dereference',
    body: 'user.name will throw if user is null',
    confidence: 0.9,
  }

  it('parses a valid finding', () => {
    expect(FindingSchema.safeParse(valid).success).toBe(true)
  })

  it('parses without optional fields', () => {
    const { line, suggestedFix, ...minimal } = {
      ...valid,
      suggestedFix: undefined,
    }
    expect(FindingSchema.safeParse(minimal).success).toBe(true)
  })

  it('rejects invalid severity', () => {
    expect(
      FindingSchema.safeParse({ ...valid, severity: 'CRITICAL' }).success
    ).toBe(false)
  })

  it('rejects invalid category', () => {
    expect(
      FindingSchema.safeParse({ ...valid, category: 'TYPOS' }).success
    ).toBe(false)
  })

  it('rejects confidence out of range', () => {
    expect(FindingSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(
      false
    )
    expect(
      FindingSchema.safeParse({ ...valid, confidence: -0.1 }).success
    ).toBe(false)
  })
})

// ── FileCoverage ──────────────────────────────────────────────────────────────

describe('FileCoverageSchema', () => {
  it('parses READ status', () => {
    expect(
      FileCoverageSchema.safeParse({ file: 'src/foo.ts', status: 'READ' })
        .success
    ).toBe(true)
  })

  it('rejects unknown status', () => {
    expect(
      FileCoverageSchema.safeParse({ file: 'src/foo.ts', status: 'PARTIAL' })
        .success
    ).toBe(false)
  })
})

// ── EnrichedContext ───────────────────────────────────────────────────────────

describe('EnrichedContextSchema', () => {
  const valid = {
    prUrl: 'https://github.com/org/repo/pull/1',
    prTitle: 'Add feature',
    prAuthor: 'ath',
    prBranch: 'ath/feature',
    diff: 'diff --git a/foo.ts ...',
    filesChanged: ['src/foo.ts'],
    fileCoverage: [],
    externalContextCalls: 0,
  }

  it('parses minimal valid context', () => {
    expect(EnrichedContextSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects invalid prUrl', () => {
    expect(
      EnrichedContextSchema.safeParse({ ...valid, prUrl: 'not-a-url' }).success
    ).toBe(false)
  })

  it('rejects negative externalContextCalls', () => {
    expect(
      EnrichedContextSchema.safeParse({ ...valid, externalContextCalls: -1 })
        .success
    ).toBe(false)
  })

  it('parses priorRounds from an earlier review of the same PR', () => {
    const parsed = EnrichedContextSchema.safeParse({
      ...valid,
      priorRounds: [
        {
          reviewId: 'rev-old',
          reviewedAt: '2026-08-16T00:00:00Z',
          summary: 'Auth leak',
          findings: [
            {
              severity: 'BLOCKING',
              category: 'SECURITY',
              file: 'src/auth.ts',
              line: 42,
              title: 'Token not cleared',
              action: 'ACCEPT',
            },
          ],
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects priorRounds with an invalid finding action', () => {
    expect(
      EnrichedContextSchema.safeParse({
        ...valid,
        priorRounds: [
          {
            reviewId: 'rev-old',
            reviewedAt: '2026-08-16T00:00:00Z',
            summary: 'x',
            findings: [
              {
                severity: 'BLOCKING',
                category: 'SECURITY',
                file: 'src/auth.ts',
                title: 'x',
                action: 'IGNORE',
              },
            ],
          },
        ],
      }).success
    ).toBe(false)
  })

  it('parses a githubConversation pack', () => {
    const parsed = EnrichedContextSchema.safeParse({
      ...valid,
      githubConversation: {
        items: [
          {
            kind: GithubCommentKind.REVIEW_BODY,
            id: 3,
            author: 'carol',
            createdAt: '2026-08-02T00:00:00Z',
            body: 'Please add tests',
          },
        ],
        omitted: false,
      },
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    // Next.js tsc: Zod string-literal kind was not assignable to GithubCommentKind.
    expect(formatContextJsonForAgents(parsed.data)).toContain(
      '<github_conversation>'
    )
  })

  it('rejects githubConversation with an unknown kind', () => {
    expect(
      EnrichedContextSchema.safeParse({
        ...valid,
        githubConversation: {
          items: [
            {
              kind: 'THREAD',
              id: 1,
              createdAt: '2026-08-02T00:00:00Z',
              body: 'x',
            },
          ],
          omitted: false,
        },
      }).success
    ).toBe(false)
  })
})

// ── DomainResult ──────────────────────────────────────────────────────────────

describe('DomainResultSchema', () => {
  const valid = {
    domain: 'CORRECTNESS',
    findings: [],
    confidence: 0.8,
    tokensUsed: 1200,
    durationMs: 4500,
  }

  it('parses a valid domain result', () => {
    expect(DomainResultSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects unknown domain', () => {
    expect(
      DomainResultSchema.safeParse({ ...valid, domain: 'GRAMMAR' }).success
    ).toBe(false)
  })
})

// ── PRReview ──────────────────────────────────────────────────────────────────

describe('PRReviewSchema', () => {
  const valid = {
    reviewId: 'rev-001',
    prUrl: 'https://github.com/org/repo/pull/1',
    summary: 'Looks good overall.',
    fileCoverage: [],
    ticketAlignment: [],
    whatLooksGood: ['Clean separation of concerns'],
    blockingIssues: [],
    suggestions: [],
    nits: [],
    questions: [],
    testingRecommendations: [],
    verdict: 'APPROVE',
    verdictSummary: 'Ship it.',
    confidence: 0.85,
  }

  it('parses a complete valid review', () => {
    expect(PRReviewSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects review missing required fields', () => {
    expect(PRReviewSchema.safeParse({ summary: 'ok' }).success).toBe(false)
  })

  it('rejects invalid verdict', () => {
    expect(
      PRReviewSchema.safeParse({ ...valid, verdict: 'MERGE' }).success
    ).toBe(false)
  })
})

// ── CheckpointRecord ──────────────────────────────────────────────────────────

describe('CheckpointRecordSchema', () => {
  const valid = {
    reviewId: 'rev-001',
    stage: 'OUTPUT',
    status: 'PASS',
    payload: { findings: 3 },
    createdAt: new Date().toISOString(),
  }

  it('parses a valid checkpoint record', () => {
    expect(CheckpointRecordSchema.safeParse(valid).success).toBe(true)
  })

  it('parses with optional agentName', () => {
    expect(
      CheckpointRecordSchema.safeParse({
        ...valid,
        stage: 'DOMAIN',
        agentName: 'correctness',
      }).success
    ).toBe(true)
  })

  it('rejects invalid stage', () => {
    expect(
      CheckpointRecordSchema.safeParse({ ...valid, stage: 'MERGE' }).success
    ).toBe(false)
  })
})
