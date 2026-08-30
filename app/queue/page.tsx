import Link from 'next/link'
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '../../src/lib/supabase/server'
import AddPrForm from './AddPrForm'
import QueueDisplay from './QueueDisplay'
import { listCompleteReviewsForHistory } from '../../src/memory/review-store'
import { healStuckInReviewRows } from '../../src/memory/tracked-pr-store'
import { reviewChipsRecord } from '../../src/lib/history-prs'

export const dynamic = 'force-dynamic'

export default async function QueuePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const service = createSupabaseServiceRoleClient()
  await healStuckInReviewRows().catch(err =>
    console.error('[queue] heal stuck IN_REVIEW:', err)
  )
  const { data: prs } = await service
    .from('tracked_prs')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: repos } = await service
    .from('configured_repos')
    .select('*')
    .eq('active', true)
    .order('owner')
    .order('name')

  const reviews = await listCompleteReviewsForHistory()
  const reviewChips = reviewChipsRecord(reviews)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            PR Review Queue
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {prs?.length ?? 0} tracked PR{(prs?.length ?? 0) !== 1 ? 's' : ''}
            {(repos?.length ?? 0) > 0 && (
              <span className="ml-2 text-gray-600">
                · {repos?.length} configured repo
                {(repos?.length ?? 0) !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/queue/settings"
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 transition hover:border-gray-600 hover:text-white"
        >
          ⚙ Settings
        </Link>
      </div>

      <AddPrForm />

      <QueueDisplay
        initialPrs={prs ?? []}
        reviewChips={reviewChips}
        userName={user?.user_metadata?.user_name}
      />
    </div>
  )
}
