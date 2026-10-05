/**
 * Queue page view state (ATH-62): which repo sections are collapsed and which
 * repos are hidden by the repo filter. Persisted in localStorage.
 *
 * Both lists are *exclusions* (collapsed / hidden), never inclusions, so a repo
 * that appears later — a new webhook repo — defaults to expanded and visible.
 * Pure — no I/O.
 */

export const QUEUE_VIEW_STORAGE_KEY = 'agamotto.queue.view.v1'

export interface QueueViewState {
  collapsedRepos: string[]
  hiddenRepos: string[]
}

export const DEFAULT_QUEUE_VIEW: QueueViewState = {
  collapsedRepos: [],
  hiddenRepos: [],
}

interface RepoRef {
  owner: string
  repo: string
}

export interface RepoCount {
  key: string
  count: number
}

export function repoKey(pr: RepoRef): string {
  return `${pr.owner}/${pr.repo}`
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []
}

/** Tolerant parse: missing, corrupt, or wrongly-shaped storage means defaults. */
export function parseQueueView(raw: string | null): QueueViewState {
  if (!raw) return DEFAULT_QUEUE_VIEW
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_QUEUE_VIEW
    const rec = parsed as Record<string, unknown>
    return {
      collapsedRepos: stringArray(rec.collapsedRepos),
      hiddenRepos: stringArray(rec.hiddenRepos),
    }
  } catch {
    return DEFAULT_QUEUE_VIEW
  }
}

export function serializeQueueView(state: QueueViewState): string {
  return JSON.stringify(state)
}

/** Add `key` if absent, remove it if present. Returns a new array. */
export function toggleKey(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key]
}

/** Repos in first-seen order with their PR counts. */
export function repoCounts(prs: RepoRef[]): RepoCount[] {
  const counts = new Map<string, number>()
  for (const pr of prs) {
    const key = repoKey(pr)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts, ([key, count]) => ({ key, count }))
}

/** Drop PRs whose repo is hidden by the repo filter. */
export function withoutHiddenRepos<T extends RepoRef>(
  prs: T[],
  hiddenRepos: string[]
): T[] {
  if (hiddenRepos.length === 0) return prs
  const hidden = new Set(hiddenRepos)
  return prs.filter(pr => !hidden.has(repoKey(pr)))
}

/**
 * Collapse every given repo, or expand them all. Only the given keys change:
 * collapse state of repos not currently listed (hidden by the filter) is kept.
 */
export function setCollapsed(
  collapsedRepos: string[],
  keys: string[],
  collapse: boolean
): string[] {
  const rest = collapsedRepos.filter(k => !keys.includes(k))
  return collapse ? [...rest, ...keys] : rest
}

/** True when every key is collapsed (and there is at least one). */
export function allCollapsed(
  collapsedRepos: string[],
  keys: string[]
): boolean {
  return keys.length > 0 && keys.every(k => collapsedRepos.includes(k))
}
