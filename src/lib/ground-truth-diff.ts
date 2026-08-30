/**
 * Deterministic diff and file coverage for a pull request (ATH-50).
 *
 * The context agent used to be the transport for the diff: its output JSON has
 * a `diff` field and the domain agents read whatever it wrote there. That put
 * the PR's source code through an 8192-token model output budget, so on any
 * non-trivial PR the model had to elide — and it did, silently, with `...`.
 * Control run R8 missed a planted defect for exactly this reason, and the
 * self-reported `fileCoverage` still said READ.
 *
 * Coverage is a fact the system owns: we apply the caps, so we know what was
 * cut. Assembling both here and overwriting the model's values is the same
 * "system is source of truth" pattern already used for prior rounds and the
 * GitHub conversation pack.
 */

import type { FileCoverage } from '../agents/pr-review/schema'

/** Per-file patch cap. ATH-28 raised this from 8 KB. */
export const FILE_PATCH_MAX_BYTES = 32 * 1024

/**
 * Whole-diff cap across all files. Five domain agents each receive the full
 * assembled diff, so this is multiplied by five against the token budget.
 */
export const DEFAULT_DIFF_MAX_BYTES = 128 * 1024

/** A patch fragment smaller than this is not worth spending the tail of the budget on. */
const MIN_USEFUL_PATCH_BYTES = 512

export const PATCH_TRUNCATED_MARKER = '[patch truncated'

/** A changed file as GitHub's pulls.listFiles returns it. */
export interface RawPrFile {
  filename: string
  status?: string
  additions?: number
  deletions?: number
  patch?: string
  blobUrl?: string
}

export interface GroundTruthDiff {
  diff: string
  filesChanged: string[]
  fileCoverage: FileCoverage[]
}

export interface TruncatedPatch {
  text: string
  truncated: boolean
  omittedBytes: number
}

/** Cut a patch to `maxBytes`, leaving the marker the truncation rules look for. */
export function truncatePatch(
  patch: string,
  maxBytes: number = FILE_PATCH_MAX_BYTES
): TruncatedPatch {
  if (patch.length <= maxBytes) {
    return { text: patch, truncated: false, omittedBytes: 0 }
  }
  const omittedBytes = patch.length - maxBytes
  return {
    text: `${patch.slice(0, maxBytes)}\n// ${PATCH_TRUNCATED_MARKER} — ${omittedBytes} bytes omitted]`,
    truncated: true,
    omittedBytes,
  }
}

function countLines(text: string): number {
  return text.split('\n').length
}

/**
 * Build the unified diff the domain agents will read, plus an honest coverage
 * report. Every changed file appears in `fileCoverage` — including the ones we
 * could not show — so a downstream agent can tell "no issues here" apart from
 * "never looked".
 */
export function assembleGroundTruthDiff(
  files: RawPrFile[],
  options: { filePatchMaxBytes?: number; diffMaxBytes?: number } = {}
): GroundTruthDiff {
  const filePatchMaxBytes = options.filePatchMaxBytes ?? FILE_PATCH_MAX_BYTES
  const diffMaxBytes = options.diffMaxBytes ?? DEFAULT_DIFF_MAX_BYTES

  const filesChanged: string[] = []
  const fileCoverage: FileCoverage[] = []
  const sections: string[] = []
  let used = 0

  for (const file of files) {
    filesChanged.push(file.filename)

    if (!file.patch) {
      fileCoverage.push({
        file: file.filename,
        status: 'SKIPPED',
        reason: 'GitHub returned no patch (binary file or too large to diff)',
      })
      continue
    }

    const linesTotal = countLines(file.patch)
    const remaining = diffMaxBytes - used

    if (remaining < MIN_USEFUL_PATCH_BYTES) {
      fileCoverage.push({
        file: file.filename,
        status: 'SKIPPED',
        reason: `whole-diff budget of ${diffMaxBytes} bytes exhausted before this file`,
        linesRead: 0,
        linesTotal,
      })
      continue
    }

    const { text, truncated, omittedBytes } = truncatePatch(
      file.patch,
      Math.min(filePatchMaxBytes, remaining)
    )
    const section = `diff --git a/${file.filename} b/${file.filename}\n${text}`
    sections.push(section)
    used += section.length + 1

    fileCoverage.push({
      file: file.filename,
      status: truncated ? 'TRUNCATED' : 'READ',
      ...(truncated
        ? {
            reason: `patch truncated — ${omittedBytes} bytes omitted`,
            linesRead: countLines(file.patch.slice(0, text.length)),
            linesTotal,
          }
        : { linesRead: linesTotal, linesTotal }),
    })
  }

  return { diff: sections.join('\n'), filesChanged, fileCoverage }
}

/** Human-readable summary for the activity feed. */
export function formatGroundTruthActivity(result: GroundTruthDiff): string {
  const truncated = result.fileCoverage.filter(
    c => c.status === 'TRUNCATED'
  ).length
  const skipped = result.fileCoverage.filter(c => c.status === 'SKIPPED').length
  const parts = [`${result.filesChanged.length} files`]
  if (truncated > 0) parts.push(`${truncated} truncated`)
  if (skipped > 0) parts.push(`${skipped} skipped`)
  return `📄 Diff loaded from GitHub (${parts.join(', ')})`
}
