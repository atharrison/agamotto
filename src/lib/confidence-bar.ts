/**
 * Confidence display tiers for the finding-card 5-segment track (ATH-43 Option D).
 *
 * Input is 0–1 (FindingSchema). Fill count and color jump at 20/40/60/80/90%.
 */

/** Empty segment fill — same as FindingCountTracks empty track. */
export const CONFIDENCE_EMPTY_SEGMENT = '#374151'

export enum ConfidenceVariant {
  SEGMENTED_TRACK = 'SEGMENTED_TRACK',
  PILL_BARS = 'PILL_BARS',
  SIGNAL_BARS = 'SIGNAL_BARS',
  DOT_ROW = 'DOT_ROW',
}

export const DEFAULT_CONFIDENCE_VARIANT = ConfidenceVariant.SEGMENTED_TRACK

export interface ConfidenceTier {
  bars: number
  color: string
}

/** Map 0–1 confidence onto 0–5 filled segments and a tier color. */
export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence < 0.2) return { bars: 0, color: '#6b7280' }
  if (confidence < 0.4) return { bars: 1, color: '#b91c1c' }
  if (confidence < 0.6) return { bars: 2, color: '#c2410c' }
  if (confidence < 0.8) return { bars: 3, color: '#ca8a04' }
  if (confidence < 0.9) return { bars: 4, color: '#15803d' }
  return { bars: 5, color: '#16a34a' }
}

/** Whole-number percent label retained next to the track. */
export function formatConfidencePercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}
