import { createSupabaseServiceRoleClient } from './supabase/server'
import { SettingKey, parseConventionsValue } from './conventions'

/**
 * Load team conventions from `settings` at review time.
 * Returns undefined on miss or error so the conventions agent uses DEFAULT_CONVENTIONS.
 */
export async function loadConventionsDoc(): Promise<string | undefined> {
  try {
    const supabase = createSupabaseServiceRoleClient()
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', SettingKey.CONVENTIONS)
      .maybeSingle()
    if (error) {
      console.error('[loadConventionsDoc]', error)
      return undefined
    }
    return parseConventionsValue(data?.value) ?? undefined
  } catch (err) {
    console.error('[loadConventionsDoc]', err)
    return undefined
  }
}
