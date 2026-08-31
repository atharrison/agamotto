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

const PutConventionsBody = z.object({
  markdown: z.string().max(MAX_CONVENTIONS_CHARS),
})

function conventionsPayload(value: unknown, isAdmin: boolean) {
  const custom = parseConventionsValue(value)
  return {
    markdown: custom ?? DEFAULT_CONVENTIONS,
    isCustom: custom !== null,
    isAdmin,
  }
}

/**
 * GET /api/queue/settings
 * Returns the conventions markdown (stored or built-in default) and whether
 * the caller may edit settings.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', SettingKey.CONVENTIONS)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/queue/settings]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    conventionsPayload(data?.value, isAdminGithubUser(user))
  )
}

/**
 * PUT /api/queue/settings
 * Body: { markdown: string }
 * Upserts the team conventions doc. Empty markdown clears the custom doc
 * so reviews fall back to DEFAULT_CONVENTIONS. Requires a GitHub login listed
 * in ADMIN_GITHUB_USERS.
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
