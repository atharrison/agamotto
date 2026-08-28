import { ReviewShell } from './ReviewShell'
import {
  getReview,
  listCompleteReviewIdsForPr,
  ReviewStatus,
} from '../../../src/memory/review-store'
import type { StoredReviewPayload } from '../../../src/lib/stored-review-ui'
import { siblingReviewNav } from '../../../src/lib/review-siblings'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ prUrl?: string; mode?: string }>
}

export default async function ReviewPage({ params, searchParams }: Props) {
  const { id: reviewId } = await params
  const { prUrl, mode } = await searchParams

  let stored = null
  try {
    stored = await getReview(reviewId)
  } catch (err) {
    console.warn(`[review/${reviewId}] page getReview failed:`, err)
  }

  const resolvedPrUrl = prUrl || stored?.pr_url || ''
  const storedResult: StoredReviewPayload | null =
    stored?.status === ReviewStatus.COMPLETE && stored.result
      ? stored.result
      : null

  let siblingIds: string[] = []
  if (resolvedPrUrl) {
    try {
      siblingIds = await listCompleteReviewIdsForPr(resolvedPrUrl)
    } catch (err) {
      console.warn(`[review/${reviewId}] sibling list failed:`, err)
    }
  }

  return (
    <ReviewShell
      reviewId={reviewId}
      prUrl={resolvedPrUrl}
      mode={mode === 'quick' ? 'quick' : 'full'}
      storedResult={storedResult}
      siblingNav={siblingReviewNav(siblingIds, reviewId)}
    />
  )
}
