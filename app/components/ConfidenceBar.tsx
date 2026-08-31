'use client'

import {
  CONFIDENCE_EMPTY_SEGMENT,
  formatConfidencePercent,
  getConfidenceTier,
} from '../../src/lib/confidence-bar'

const SEGMENT_INDICES = [0, 1, 2, 3, 4] as const

function segmentRadius(index: number): string {
  if (index === 0) return '3px 1px 1px 3px'
  if (index === 4) return '1px 3px 3px 1px'
  return '1px'
}

/** Option D — joined 5-segment track. Compact enough to sit on the finding meta row. */
export function ConfidenceBar({ confidence }: { confidence: number }) {
  const { bars, color } = getConfidenceTier(confidence)
  const label = `${formatConfidencePercent(confidence)} confidence`

  return (
    <span
      className="inline-flex items-center gap-px shrink-0"
      title={label}
      role="img"
      aria-label={label}
    >
      {SEGMENT_INDICES.map(i => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            display: 'block',
            width: 12,
            height: 6,
            borderRadius: segmentRadius(i),
            background: i < bars ? color : CONFIDENCE_EMPTY_SEGMENT,
          }}
        />
      ))}
    </span>
  )
}
