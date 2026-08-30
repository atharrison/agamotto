import Link from 'next/link'
import type { HistoryReviewChip } from '../../src/lib/history-prs'
import { FindingCountTracks } from './FindingCountTracks'

function formatChipDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Flat R# + finding-count bars. Oldest chip first. */
export function ReviewRoundChips({
  reviews,
}: {
  reviews: HistoryReviewChip[]
}) {
  if (reviews.length === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {reviews.map(chip => (
        <Link
          key={chip.id}
          href={`/review/${chip.id}`}
          title={formatChipDate(chip.createdAt)}
          aria-label={`Review ${chip.round}, ${chip.counts.blocking} blockers, ${chip.counts.suggestions} suggestions, ${chip.counts.nits} nits`}
          className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-gray-700 bg-gray-950 px-2 transition hover:border-indigo-700"
        >
          <span className="text-[10px] font-medium leading-none text-gray-400">
            R{chip.round}
          </span>
          <FindingCountTracks counts={chip.counts} />
        </Link>
      ))}
    </div>
  )
}
