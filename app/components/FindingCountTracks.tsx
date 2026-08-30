import type { FindingCounts } from '../../src/lib/finding-counts'
import { FindingSeverity } from '../../src/lib/finding-counts'
import { findingCountTrackWidths } from '../../src/lib/finding-count-tracks'

const TRACK_MAX_PX = 48
const STUB_PX = 6
const EMPTY_TRACK = '#374151'
const TRACK_HEIGHT_PX = 4

const TRACK_COLOR: Record<FindingSeverity, string> = {
  [FindingSeverity.BLOCKING]: '#b91c1c',
  [FindingSeverity.SUGGESTION]: '#ca8a04',
  [FindingSeverity.NIT]: '#6b7280',
}

function Track({
  count,
  fraction,
  color,
  label,
}: {
  count: number
  fraction: number
  color: string
  label: string
}) {
  const widthPx = count === 0 ? STUB_PX : Math.round(fraction * TRACK_MAX_PX)
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${count} ${label}`}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'block',
          width: widthPx,
          height: TRACK_HEIGHT_PX,
          borderRadius: 2,
          background: count === 0 ? EMPTY_TRACK : color,
        }}
      />
      <span className="text-[10px] leading-none tabular-nums" style={{ color }}>
        {count}
      </span>
    </span>
  )
}

/** Three mix-encoded finding-count tracks for a review chip. */
export function FindingCountTracks({ counts }: { counts: FindingCounts }) {
  const widths = findingCountTrackWidths(counts)
  return (
    <span className="inline-flex items-center gap-1.5">
      <Track
        count={counts.blocking}
        fraction={widths.blocking}
        color={TRACK_COLOR[FindingSeverity.BLOCKING]}
        label="blockers"
      />
      <Track
        count={counts.suggestions}
        fraction={widths.suggestions}
        color={TRACK_COLOR[FindingSeverity.SUGGESTION]}
        label="suggestions"
      />
      <Track
        count={counts.nits}
        fraction={widths.nits}
        color={TRACK_COLOR[FindingSeverity.NIT]}
        label="nits"
      />
    </span>
  )
}
