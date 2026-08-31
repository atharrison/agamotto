/**
 * Unit tests for GET/PUT /api/queue/settings (ATH-23 conventions editor).
 */

import { NextRequest } from 'next/server'

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'upsert', 'eq', 'in']) {
    chain[m] = jest.fn().mockReturnValue(chain)
  }
  chain.maybeSingle = jest.fn().mockResolvedValue(result)
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  return chain
}

type MockChain = ReturnType<typeof makeChain>

interface MockSupabaseClient {
  auth: { getUser: jest.Mock }
  from: jest.Mock
  _chain: MockChain
}

function makeSupabaseClient(
  user: unknown,
  queryResult: { data: unknown; error: unknown }
): MockSupabaseClient {
  const chain = makeChain(queryResult)
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

const mockAnonClient: { current: MockSupabaseClient | null } = { current: null }

jest.mock('../src/lib/supabase/server', () => ({
  createSupabaseServerClient: jest
    .fn()
    .mockImplementation(() => mockAnonClient.current),
  createSupabaseServiceRoleClient: jest.fn(),
  getGitHubToken: jest.fn().mockResolvedValue(null),
  GH_TOKEN_COOKIE: 'gh_provider_token',
}))

const ADMIN_USER = {
  id: 'user-1',
  user_metadata: { user_name: 'atharrison' },
}
const OTHER_USER = {
  id: 'user-2',
  user_metadata: { user_name: 'coworker' },
}

function makeRequest(
  url: string,
  options?: { method?: string; body?: unknown }
): NextRequest {
  return new NextRequest(url, {
    method: options?.method ?? 'GET',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })
}

const originalAdmin = process.env.ADMIN_GITHUB_USERS

beforeEach(() => {
  jest.resetModules()
  process.env.ADMIN_GITHUB_USERS = 'atharrison'
})

afterAll(() => {
  if (originalAdmin === undefined) delete process.env.ADMIN_GITHUB_USERS
  else process.env.ADMIN_GITHUB_USERS = originalAdmin
})

describe('GET /api/queue/settings', () => {
  it('returns 401 when not authenticated', async () => {
    mockAnonClient.current = makeSupabaseClient(null, {
      data: null,
      error: null,
    })
    const { GET } = await import('../app/api/queue/settings/route')
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns stored markdown and isCustom=true when a row exists', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: [{ key: 'CONVENTIONS', value: 'Prefer named exports' }],
      error: null,
    })
    const { GET } = await import('../app/api/queue/settings/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.markdown).toBe('Prefer named exports')
    expect(body.isCustom).toBe(true)
    expect(body.isAdmin).toBe(true)
    expect(body.overlays.CONTEXT).toEqual({ text: '', isCustom: false })
    expect(mockAnonClient.current.from).toHaveBeenCalledWith('settings')
  })

  it('returns DEFAULT_CONVENTIONS when no row is stored', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { GET } = await import('../app/api/queue/settings/route')
    const { DEFAULT_CONVENTIONS } = await import('../src/lib/conventions')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.markdown).toBe(DEFAULT_CONVENTIONS)
    expect(body.isCustom).toBe(false)
    expect(body.overlays.PERFORMANCE).toEqual({ text: '', isCustom: false })
  })

  it('returns isAdmin=false when ADMIN_GITHUB_USERS is unset', async () => {
    delete process.env.ADMIN_GITHUB_USERS
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { GET } = await import('../app/api/queue/settings/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isAdmin).toBe(false)
  })

  it('returns isAdmin=false for a non-admin when the allowlist is set', async () => {
    process.env.ADMIN_GITHUB_USERS = 'atharrison'
    mockAnonClient.current = makeSupabaseClient(OTHER_USER, {
      data: null,
      error: null,
    })
    const { GET } = await import('../app/api/queue/settings/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isAdmin).toBe(false)
  })

  it('returns 500 on DB error', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: { message: 'DB failure' },
    })
    const { GET } = await import('../app/api/queue/settings/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('returns stored overlays keyed by agent', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: [
        { key: 'OVERLAY_PERFORMANCE', value: 'Flag useEffect fetch' },
        { key: 'CONVENTIONS', value: 'Use enums' },
      ],
      error: null,
    })
    const { GET } = await import('../app/api/queue/settings/route')
    const res = await GET()
    const body = await res.json()
    expect(body.overlays.PERFORMANCE).toEqual({
      text: 'Flag useEffect fetch',
      isCustom: true,
    })
    expect(body.markdown).toBe('Use enums')
  })
})

describe('PUT /api/queue/settings', () => {
  it('returns 401 when not authenticated', async () => {
    mockAnonClient.current = makeSupabaseClient(null, {
      data: null,
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: 'hello' },
      })
    )
    expect(res.status).toBe(401)
  })

  it('returns 403 when ADMIN_GITHUB_USERS is unset', async () => {
    delete process.env.ADMIN_GITHUB_USERS
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: 'hello' },
      })
    )
    expect(res.status).toBe(403)
    expect(mockAnonClient.current.from).not.toHaveBeenCalled()
  })

  it('returns 403 when the caller is not an admin', async () => {
    process.env.ADMIN_GITHUB_USERS = 'atharrison'
    mockAnonClient.current = makeSupabaseClient(OTHER_USER, {
      data: null,
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: 'hello' },
      })
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Admin access required' })
    expect(mockAnonClient.current.from).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const req = new Request('http://localhost/api/queue/settings', {
      method: 'PUT',
      body: 'not-json',
      headers: { 'Content-Type': 'text/plain' },
    }) as unknown as NextRequest
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when markdown is missing or not a string', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const missing = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: {},
      })
    )
    expect(missing.status).toBe(400)

    const wrongType = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: 12 },
      })
    )
    expect(wrongType.status).toBe(400)
  })

  it('returns 400 when markdown exceeds the size cap', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { MAX_CONVENTIONS_CHARS } = await import('../src/lib/conventions')
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: 'x'.repeat(MAX_CONVENTIONS_CHARS + 1) },
      })
    )
    expect(res.status).toBe(400)
  })

  it('upserts conventions and returns 200', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: { key: 'CONVENTIONS', value: 'Use enums' },
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: 'Use enums' },
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.markdown).toBe('Use enums')
    expect(body.isCustom).toBe(true)
    expect(mockAnonClient.current.from).toHaveBeenCalledWith('settings')
    expect(mockAnonClient.current._chain.upsert).toHaveBeenCalledWith(
      { key: 'CONVENTIONS', value: 'Use enums' },
      { onConflict: 'key' }
    )
  })

  it('allows saving an empty string to fall back to defaults', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: { key: 'CONVENTIONS', value: '' },
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const { DEFAULT_CONVENTIONS } = await import('../src/lib/conventions')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: '' },
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.markdown).toBe(DEFAULT_CONVENTIONS)
    expect(body.isCustom).toBe(false)
  })

  it('returns 200 when upsert succeeds with no returned row', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: 'Use enums' },
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.markdown).toBe('Use enums')
    expect(body.isCustom).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: { message: 'upsert failed' },
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { markdown: 'Use enums' },
      })
    )
    expect(res.status).toBe(500)
  })

  it('upserts an agent overlay and returns 200', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: { key: 'OVERLAY_PERFORMANCE', value: 'Flag useEffect fetch' },
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { agent: 'PERFORMANCE', overlay: 'Flag useEffect fetch' },
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agent).toBe('PERFORMANCE')
    expect(body.overlay).toBe('Flag useEffect fetch')
    expect(body.isCustom).toBe(true)
    expect(mockAnonClient.current._chain.upsert).toHaveBeenCalledWith(
      { key: 'OVERLAY_PERFORMANCE', value: 'Flag useEffect fetch' },
      { onConflict: 'key' }
    )
  })

  it('returns 200 when overlay upsert succeeds with no returned row', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { agent: 'CONTEXT', overlay: 'Also search RIB-' },
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.overlay).toBe('Also search RIB-')
    expect(body.isCustom).toBe(true)
  })

  it('returns 400 when overlay exceeds the size cap', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: null,
    })
    const { MAX_OVERLAY_CHARS } = await import('../src/lib/overlays')
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: {
          agent: 'CONTEXT',
          overlay: 'x'.repeat(MAX_OVERLAY_CHARS + 1),
        },
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns 403 for overlay writes when the caller is not an admin', async () => {
    mockAnonClient.current = makeSupabaseClient(OTHER_USER, {
      data: null,
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { agent: 'CONTEXT', overlay: 'house rule' },
      })
    )
    expect(res.status).toBe(403)
    expect(mockAnonClient.current.from).not.toHaveBeenCalled()
  })

  it('allows saving an empty overlay to fall back to shipped defaults', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: { key: 'OVERLAY_STYLE', value: '' },
      error: null,
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { agent: 'STYLE', overlay: '' },
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.overlay).toBe('')
    expect(body.isCustom).toBe(false)
  })

  it('returns 500 when overlay upsert fails', async () => {
    mockAnonClient.current = makeSupabaseClient(ADMIN_USER, {
      data: null,
      error: { message: 'upsert failed' },
    })
    const { PUT } = await import('../app/api/queue/settings/route')
    const res = await PUT(
      makeRequest('http://localhost/api/queue/settings', {
        method: 'PUT',
        body: { agent: 'CONTEXT', overlay: 'house rule' },
      })
    )
    expect(res.status).toBe(500)
  })
})
