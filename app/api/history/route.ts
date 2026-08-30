import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../src/lib/supabase/server'
import { listCompleteReviewsForHistory } from '../../../src/memory/review-store'
import {
  healStuckInReviewRows,
  listTrackedPrsByUrls,
} from '../../../src/memory/tracked-pr-store'
import { buildHistoryPayload } from '../../../src/lib/history-prs'

/**
 * GET /api/history
 * COMPLETE reviews grouped into PR bars, newest last-review first.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await healStuckInReviewRows().catch(err =>
      console.error('[GET /api/history] heal stuck IN_REVIEW:', err)
    )
    const reviews = await listCompleteReviewsForHistory()
    const urls = [...new Set(reviews.map(row => row.pr_url))]
    const tracked = await listTrackedPrsByUrls(urls)
    return NextResponse.json(buildHistoryPayload(reviews, tracked))
  } catch (err) {
    console.error('[GET /api/history]', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
