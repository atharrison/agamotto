/**
 * Score control-PR review dumps against a plant spec (ATH-50).
 *
 *   npm run score:control -- [specPath] [dumpsDir]
 *
 * Defaults to `generated/ath-43-control-spec.json` and `generated/control-reviews`.
 * Both live outside version control on purpose — see `src/lib/control-scoring.ts`.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatScoreReport,
  scoreRuns,
  type ControlRun,
  type ControlSpec,
} from '../src/lib/control-scoring.ts'

const DEFAULT_SPEC = 'generated/ath-43-control-spec.json'
const DEFAULT_DUMPS = 'generated/control-reviews'

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function loadRuns(dir: string): ControlRun[] {
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const raw = readJson<Partial<ControlRun> & { round?: number }>(
        join(dir, name)
      )
      if (typeof raw.round !== 'number') {
        throw new Error(`${name}: missing numeric "round"`)
      }
      return {
        round: raw.round,
        id: raw.id,
        notes: raw.notes,
        findings: raw.findings ?? [],
      }
    })
}

function main(): void {
  const [specPath = DEFAULT_SPEC, dumpsDir = DEFAULT_DUMPS] =
    process.argv.slice(2)

  const spec = readJson<ControlSpec>(specPath)
  const runs = loadRuns(dumpsDir)

  if (runs.length === 0) {
    console.error(`No run dumps found in ${dumpsDir}`)
    process.exit(1)
  }

  console.log(`# Control review scores\n`)
  console.log(
    `Spec: \`${specPath}\` · Dumps: \`${dumpsDir}\` · ${runs.length} runs\n`
  )
  console.log(formatScoreReport(scoreRuns(runs, spec), spec))
}

main()
