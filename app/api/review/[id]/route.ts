import { type NextRequest } from 'next/server'
import {
  createReview,
  getReview,
  ReviewStatus,
} from '../../../../src/memory/review-store'
import { markPrReviewFailed } from '../../../../src/memory/tracked-pr-store'
import {
  getFreshGitHubToken,
  githubTokenFromFresh,
} from '../../../../src/lib/github-auth'
import { parsePrUrl } from '../../../../src/lib/queue'
import {
  ReviewStreamKind,
  resolveReviewStream,
} from '../../../../src/lib/review-stream'
import {
  PR_FETCH_MESSAGES,
  prFetchFailureFromMessage,
} from '../../../../src/lib/pr-fetch-error'
import { encodeSseEvent, tryEnqueueSse } from '../../../../src/lib/sse'
import {
  tokenBudgetErrorMessage,
  tokenBudgetOverageFromMessage,
  tokenBudgetStats,
} from '../../../../src/lib/review-run-stats'
import { extrasFromReview } from '../../../../src/lib/review-sections'
import {
  executeReviewPipeline,
  waitForInflightPipeline,
} from '../../../../src/lib/execute-review-pipeline'

// Must be a numeric literal — Next.js static analysis rejects CallExpressions.
// Keep in sync with DEFAULT_TIMEOUT_MS / 1000 in src/lib/harness-limits.ts.
export const maxDuration = 300

/**
 * GET /api/review/[id]?prUrl=<encoded>&mode=full|quick
 * Server-Sent Events stream for live review progress.
 *
 * Event types emitted:
 *   connected   { reviewId, prUrl }
 *   checkpoint  { stage, status, reviewId }
 *   finding     { finding: Finding }
 *   alarm       { alarm }
 *   stats       { tokensUsed, estimatedCostUsd, durationMs, findingsCount, phaseDurations }
 *   error       { error: string, failure?: PrFetchFailure }
 *   done        { reviewId, extras? }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const { searchParams } = new URL(request.url)
  const prUrl = searchParams.get('prUrl') ?? ''
  const rawMode = searchParams.get('mode')
  const mode: 'full' | 'quick' = rawMode === 'quick' ? 'quick' : 'full'

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        tryEnqueueSse(
          chunk => controller.enqueue(chunk),
          encoder.encode(encodeSseEvent(event, data))
        )
      }

      send('connected', { reviewId, prUrl, message: 'Stream connected' })

      // Look up the DB row before requiring ?prUrl= so queue "View Review"
      // links (`/review/{id}` with no query) can replay COMPLETE results.
      let existing = null
      try {
        existing = await getReview(reviewId)
      } catch (err) {
        console.warn(`[review/${reviewId}] getReview check failed:`, err)
      }

      if (existing?.status === ReviewStatus.RUNNING) {
        const inflight = waitForInflightPipeline(reviewId)
        if (inflight) {
          await inflight
          try {
            existing = await getReview(reviewId)
          } catch (err) {
            console.warn(
              `[review/${reviewId}] getReview after inflight failed:`,
              err
            )
          }
        }
        // No inflight: this process did not start the run (restart, or the
        // webhook worker died). Fall through to RUN and heal. Do not replay —
        // RUNNING rows have no result yet.
      }

      const decision = resolveReviewStream({
        queryPrUrl: prUrl,
        stored: existing
          ? {
              status: existing.status,
              pr_url: existing.pr_url,
              result: existing.result,
            }
          : null,
      })

      if (decision.kind === ReviewStreamKind.ERROR) {
        if (existing?.status === ReviewStatus.ERROR) {
          const parsed = parsePrUrl(existing.pr_url)
          if (parsed) await markPrReviewFailed(parsed).catch(() => {})
        }
        const storedMessage = existing?.error_message ?? ''
        const overage = tokenBudgetOverageFromMessage(storedMessage)
        const prFetchFailure = prFetchFailureFromMessage(storedMessage)
        if (overage) {
          send('stats', tokenBudgetStats(overage))
          send('error', { error: tokenBudgetErrorMessage(overage) })
        } else if (prFetchFailure) {
          send('error', {
            error: PR_FETCH_MESSAGES[prFetchFailure],
            failure: prFetchFailure,
          })
        } else {
          send('error', { error: decision.error })
        }
        send('done', { reviewId })
        controller.close()
        return
      }

      if (decision.kind === ReviewStreamKind.REPLAY && existing?.result) {
        const review = existing.result
        send('connected', {
          reviewId,
          prUrl: decision.prUrl,
          cached: true,
          message: 'Loaded from database',
        })
        // Replay synthetic pipeline checkpoints so the UI renders all stages
        const stages = ['INPUT', 'CONTEXT', 'DOMAIN', 'OUTPUT']
        for (const stage of stages) {
          send('checkpoint', { stage, status: 'PASS', reviewId })
        }
        const allFindings = [
          ...(review.blockingIssues ?? []),
          ...(review.suggestions ?? []),
          ...(review.nits ?? []),
        ]
        for (const finding of allFindings) {
          send('finding', { finding })
        }
        send('done', { reviewId, extras: extrasFromReview(review) })
        controller.close()
        return
      }

      const runPrUrl = decision.prUrl

      // Fresh run — create the review row if start didn't already, then run
      // the pipeline. Duplicate insert is skipped so ATH-15 can mint the row
      // in /api/review/start (needed for tracked_prs.last_review_id FK).
      if (!existing) {
        try {
          await createReview(reviewId, runPrUrl, mode)
        } catch (err) {
          console.error(`[review/${reviewId}] createReview failed:`, err)
          send('error', {
            error:
              'Failed to initialize review — database write error. Check server logs for details.',
          })
          send('done', { reviewId })
          controller.close()
          return
        }
      }

      // Errors are emitted inside executeReviewPipeline (catch + SSE).
      try {
        const fresh = await getFreshGitHubToken()
        if (!fresh.ok) {
          // Visible in the dev/Railway log: which auth failure ended the run.
          console.warn(
            `[review/${reviewId}] GitHub session unusable (${fresh.error}) — failing with sign-in copy`
          )
        }
        await executeReviewPipeline({
          reviewId,
          prUrl: runPrUrl,
          mode,
          githubToken: githubTokenFromFresh(fresh),
          // ATH-61: a dead session fails here rather than silently falling
          // back to GITHUB_TOKEN and then failing to post.
          sessionExpired: !fresh.ok,
          emit: send,
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
