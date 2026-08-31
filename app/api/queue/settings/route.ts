import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  DEFAULT_CONVENTIONS,
  MAX_CONVENTIONS_CHARS,
  SettingKey,
  parseConventionsValue,
} from '../../../../src/lib/conventions'
import { isAdminGithubUser } from '../../../../src/lib/github-users'
import { createSupabaseServerClient } from '../../../../src/lib/supabase/server'
import {
  MAX_OVERLAY_CHARS,
  OVERLAY_AGENTS,
  OVERLAY_SETTING_KEY,
  OverlayAgent,
  overlaysFromRows,
  parseOverlayValue,
} from '../../../../src/lib/overlays'

const PutConventionsBody = z.object({
  markdown: z.string().max(MAX_CONVENTIONS_CHARS),
})

const PutOverlayBody = z.object({
  agent: z.nativeEnum(OverlayAgent),
  overlay: z.string().max(MAX_OVERLAY_CHARS),
})

type SettingsRow = { key?: unknown; value?: unknown }

function overlayPayload(overlays: ReturnType<typeof overlaysFromRows>) {
  return Object.fromEntries(
    OVERLAY_AGENTS.map(agent => [
      agent,
      { text: overlays[agent], isCustom: overlays[agent].length > 0 },
    ])
  ) as Record<OverlayAgent, { text: string; isCustom: boolean }>
}

function conventionsPayload(value: unknown, isAdmin: boolean) {
  const custom = parseConventionsValue(value)
  return {
    markdown: custom ?? DEFAULT_CONVENTIONS,
    isCustom: custom !== null,
    isAdmin,
  }
}

function settingsPayload(rows: SettingsRow[] | null, isAdmin: boolean) {
  const list = rows ?? []
  const conventions = list.find(row => row.key === SettingKey.CONVENTIONS)
  return {
    ...conventionsPayload(conventions?.value, isAdmin),
    overlays: overlayPayload(overlaysFromRows(list)),
  }
}

function asRows(data: unknown): SettingsRow[] | null {
  return Array.isArray(data) ? (data as SettingsRow[]) : null
}

/**
 * GET /api/queue/settings
 * Returns conventions markdown, per-agent overlays, and whether the caller
 * may edit settings.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('settings').select('key, value')

  if (error) {
    console.error('[GET /api/queue/settings]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    settingsPayload(asRows(data), isAdminGithubUser(user))
  )
}

/**
 * PUT /api/queue/settings
 * Conventions: { markdown: string }
 * Overlay: { agent: OverlayAgent, overlay: string }
 * Empty string clears the custom value so reviews fall back to shipped defaults.
 * Requires a GitHub login listed in ADMIN_GITHUB_USERS.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminGithubUser(user)) {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const overlayParsed = PutOverlayBody.safeParse(body)
  if (overlayParsed.success) {
    const { agent, overlay } = overlayParsed.data
    const { data, error } = await supabase
      .from('settings')
      .upsert(
        { key: OVERLAY_SETTING_KEY[agent], value: overlay },
        { onConflict: 'key' }
      )
      .select()
      .maybeSingle()

    if (error) {
      console.error('[PUT /api/queue/settings overlay]', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }

    const saved = parseOverlayValue(data?.value ?? overlay)
    return NextResponse.json({
      agent,
      overlay: saved ?? '',
      isCustom: saved !== null,
      isAdmin: true,
    })
  }

  const parsed = PutConventionsBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('settings')
    .upsert(
      { key: SettingKey.CONVENTIONS, value: parsed.data.markdown },
      { onConflict: 'key' }
    )
    .select()
    .maybeSingle()

  if (error) {
    console.error('[PUT /api/queue/settings]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    conventionsPayload(data?.value ?? parsed.data.markdown, true)
  )
}
