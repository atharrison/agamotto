import { createSupabaseServiceRoleClient } from './supabase/server'
import { SETTING_KEYS, SettingKey, parseConventionsValue } from './conventions'
import {
  EMPTY_OVERLAYS,
  overlaysFromRows,
  type AgentOverlays,
} from './overlays'

export interface ReviewSettings {
  conventionsDoc: string | undefined
  overlays: AgentOverlays
}

function emptySettings(): ReviewSettings {
  return { conventionsDoc: undefined, overlays: { ...EMPTY_OVERLAYS } }
}

/**
 * Load conventions + per-agent overlays from `settings` at review time.
 * Returns empty overlays / undefined conventions on miss or error so agents
 * fall back to shipped defaults.
 */
export async function loadReviewSettings(): Promise<ReviewSettings> {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', SETTING_KEYS)
    if (error) {
      console.error('[loadReviewSettings]', error)
      return emptySettings()
    }
    const rows = data ?? []
    const conventionsRow = rows.find(
      (row: { key?: unknown }) => row.key === SettingKey.CONVENTIONS
    )
    return {
      conventionsDoc: parseConventionsValue(conventionsRow?.value) ?? undefined,
      overlays: overlaysFromRows(rows),
    }
  } catch (err) {
    console.error('[loadReviewSettings]', err)
    return emptySettings()
  }
}

/**
 * Load team conventions from `settings` at review time.
 * Returns undefined on miss or error so the conventions agent uses DEFAULT_CONVENTIONS.
 */
export async function loadConventionsDoc(): Promise<string | undefined> {
  return (await loadReviewSettings()).conventionsDoc
}
