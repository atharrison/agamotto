/**
 * ATH-44 — GitHub OAuth access-token verify + refresh.
 *
 * Supabase drops provider_token / provider_refresh_token on session refresh.
 * We persist both in httpOnly cookies and rotate them when GET /user is 401/403.
 */

const mockCookieGet = jest.fn()
const mockCookieSet = jest.fn()
const mockCookieDelete = jest.fn()
const mockGetUser = jest.fn()
const mockGetSession = jest.fn()
const mockCreateSupabaseServerClient = jest.fn()

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: (...args: unknown[]) => mockCookieGet(...args),
    set: (...args: unknown[]) => mockCookieSet(...args),
    delete: (...args: unknown[]) => mockCookieDelete(...args),
  }),
}))

jest.mock('../src/lib/supabase/server', () => {
  const actual = jest.requireActual(
    '../src/lib/supabase/server'
  ) as typeof import('../src/lib/supabase/server')
  return {
    ...actual,
    createSupabaseServerClient: (...args: unknown[]) =>
      mockCreateSupabaseServerClient(...args),
  }
})

import {
  GitHubAuthError,
  GITHUB_OAUTH_ACCESS_TOKEN_URL,
  GITHUB_SESSION_EXPIRED_MESSAGE,
  GH_ACCESS_TOKEN_MAX_AGE,
  GH_REFRESH_COOKIE,
  GH_REFRESH_TOKEN_MAX_AGE,
  clearGitHubTokenCookies,
  getFreshGitHubToken,
  githubTokenFromFresh,
  parseGitHubOAuthTokenResponse,
  setGitHubTokenCookies,
  shouldRefreshGitHubToken,
} from '../src/lib/github-auth'
import { GH_TOKEN_COOKIE } from '../src/lib/supabase/server'

const originalFetch = global.fetch
const originalClientId = process.env.GITHUB_CLIENT_ID
const originalClientSecret = process.env.GITHUB_CLIENT_SECRET
const originalNodeEnv = process.env.NODE_ENV

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function cookieMap(values: Record<string, string | undefined>) {
  mockCookieGet.mockImplementation((name: string) => {
    const value = values[name]
    return value === undefined ? undefined : { value }
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GITHUB_CLIENT_ID = 'client-id'
  process.env.GITHUB_CLIENT_SECRET = 'client-secret'
  process.env.NODE_ENV = 'test'
  mockCreateSupabaseServerClient.mockResolvedValue({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  })
  mockGetSession.mockResolvedValue({ data: { session: null } })
  cookieMap({})
  global.fetch = jest.fn()
})

afterAll(() => {
  global.fetch = originalFetch
  process.env.GITHUB_CLIENT_ID = originalClientId
  process.env.GITHUB_CLIENT_SECRET = originalClientSecret
  process.env.NODE_ENV = originalNodeEnv
})

describe('shouldRefreshGitHubToken', () => {
  it('is true only for 401 and 403', () => {
    expect(shouldRefreshGitHubToken(401)).toBe(true)
    expect(shouldRefreshGitHubToken(403)).toBe(true)
    expect(shouldRefreshGitHubToken(200)).toBe(false)
    expect(shouldRefreshGitHubToken(404)).toBe(false)
    expect(shouldRefreshGitHubToken(500)).toBe(false)
  })
})

describe('parseGitHubOAuthTokenResponse', () => {
  it('parses access + refresh tokens and expiry fields', () => {
    expect(
      parseGitHubOAuthTokenResponse({
        access_token: 'ghu_new',
        refresh_token: 'ghr_new',
        expires_in: 100,
        refresh_token_expires_in: 200,
      })
    ).toEqual({
      accessToken: 'ghu_new',
      refreshToken: 'ghr_new',
      accessTokenMaxAge: 100,
      refreshTokenMaxAge: 200,
    })
  })

  it('defaults maxAge when expiry fields are missing or non-positive', () => {
    expect(parseGitHubOAuthTokenResponse({ access_token: 'ghu_only' })).toEqual(
      {
        accessToken: 'ghu_only',
        refreshToken: undefined,
        accessTokenMaxAge: GH_ACCESS_TOKEN_MAX_AGE,
        refreshTokenMaxAge: GH_REFRESH_TOKEN_MAX_AGE,
      }
    )
    expect(
      parseGitHubOAuthTokenResponse({
        access_token: 'ghu_zero',
        expires_in: 0,
        refresh_token_expires_in: -1,
      })
    ).toMatchObject({
      accessTokenMaxAge: GH_ACCESS_TOKEN_MAX_AGE,
      refreshTokenMaxAge: GH_REFRESH_TOKEN_MAX_AGE,
    })
  })

  it('returns null for error payloads and invalid bodies', () => {
    expect(
      parseGitHubOAuthTokenResponse({ error: 'bad_refresh_token' })
    ).toBeNull()
    expect(parseGitHubOAuthTokenResponse({ access_token: '' })).toBeNull()
    expect(parseGitHubOAuthTokenResponse({ access_token: 1 })).toBeNull()
    expect(parseGitHubOAuthTokenResponse(null)).toBeNull()
    expect(parseGitHubOAuthTokenResponse('nope')).toBeNull()
  })
})

describe('GitHub token cookies', () => {
  it('sets the access cookie and the refresh cookie when present', () => {
    const store = { set: jest.fn(), delete: jest.fn() }
    setGitHubTokenCookies(store, {
      accessToken: 'ghu_a',
      refreshToken: 'ghr_a',
      accessTokenMaxAge: 10,
      refreshTokenMaxAge: 20,
    })
    expect(store.set).toHaveBeenCalledWith(
      GH_TOKEN_COOKIE,
      'ghu_a',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 10,
        secure: false,
      })
    )
    expect(store.set).toHaveBeenCalledWith(
      GH_REFRESH_COOKIE,
      'ghr_a',
      expect.objectContaining({ maxAge: 20, httpOnly: true })
    )
  })

  it('defaults cookie maxAge when omitted (OAuth callback path)', () => {
    const store = { set: jest.fn(), delete: jest.fn() }
    setGitHubTokenCookies(store, {
      accessToken: 'ghu_a',
      refreshToken: 'ghr_a',
    })
    expect(store.set).toHaveBeenCalledWith(
      GH_TOKEN_COOKIE,
      'ghu_a',
      expect.objectContaining({ maxAge: GH_ACCESS_TOKEN_MAX_AGE })
    )
    expect(store.set).toHaveBeenCalledWith(
      GH_REFRESH_COOKIE,
      'ghr_a',
      expect.objectContaining({ maxAge: GH_REFRESH_TOKEN_MAX_AGE })
    )
  })

  it('skips the refresh cookie when no refresh token is provided', () => {
    const store = { set: jest.fn(), delete: jest.fn() }
    setGitHubTokenCookies(store, { accessToken: 'ghu_a' })
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(store.set).toHaveBeenCalledWith(
      GH_TOKEN_COOKIE,
      'ghu_a',
      expect.objectContaining({ maxAge: GH_ACCESS_TOKEN_MAX_AGE })
    )
  })

  it('marks cookies secure in production', () => {
    process.env.NODE_ENV = 'production'
    const store = { set: jest.fn(), delete: jest.fn() }
    setGitHubTokenCookies(store, { accessToken: 'ghu_a' })
    expect(store.set).toHaveBeenCalledWith(
      GH_TOKEN_COOKIE,
      'ghu_a',
      expect.objectContaining({ secure: true })
    )
  })

  it('clears both token cookies', () => {
    const store = { set: jest.fn(), delete: jest.fn() }
    clearGitHubTokenCookies(store)
    expect(store.delete).toHaveBeenCalledWith(GH_TOKEN_COOKIE)
    expect(store.delete).toHaveBeenCalledWith(GH_REFRESH_COOKIE)
  })
})

describe('GITHUB_SESSION_EXPIRED_MESSAGE', () => {
  it('is the copy ATH-42 can surface in the finalize UI', () => {
    expect(GITHUB_SESSION_EXPIRED_MESSAGE).toMatch(/sign in again/i)
  })
})

describe('githubTokenFromFresh', () => {
  it('unwraps an ok result and returns null on error', () => {
    expect(githubTokenFromFresh({ ok: true, token: 'ghu_a' })).toBe('ghu_a')
    expect(
      githubTokenFromFresh({
        ok: false,
        error: GitHubAuthError.NO_SESSION,
      })
    ).toBeNull()
  })
})

describe('getFreshGitHubToken', () => {
  it('returns NO_SESSION when there is no Supabase user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.NO_SESSION,
    })
  })

  it('returns NO_SESSION when getUser errors', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'jwt expired' },
    })
    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.NO_SESSION,
    })
  })

  it('returns NO_SESSION when the supabase client throws', async () => {
    mockCreateSupabaseServerClient.mockRejectedValue(new Error('boom'))
    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.NO_SESSION,
    })
  })

  it('returns a live access token without calling the refresh endpoint', async () => {
    cookieMap({ [GH_TOKEN_COOKIE]: 'ghu_live' })
    ;(global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { login: 'a' })
    )

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: true,
      token: 'ghu_live',
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ghu_live',
        }),
      })
    )
  })

  it('returns the existing token when GET /user fails at the network layer', async () => {
    cookieMap({ [GH_TOKEN_COOKIE]: 'ghu_live' })
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('DNS'))

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: true,
      token: 'ghu_live',
    })
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('refreshes on 401 and writes rotated cookies', async () => {
    cookieMap({
      [GH_TOKEN_COOKIE]: 'ghu_stale',
      [GH_REFRESH_COOKIE]: 'ghr_old',
    })
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Bad credentials' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'ghu_fresh',
          refresh_token: 'ghr_new',
          expires_in: 28800,
          refresh_token_expires_in: 15897600,
        })
      )

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: true,
      token: 'ghu_fresh',
    })
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      GITHUB_OAUTH_ACCESS_TOKEN_URL,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('grant_type=refresh_token'),
      })
    )
    expect(mockCookieSet).toHaveBeenCalledWith(
      GH_TOKEN_COOKIE,
      'ghu_fresh',
      expect.objectContaining({ maxAge: 28800 })
    )
    expect(mockCookieSet).toHaveBeenCalledWith(
      GH_REFRESH_COOKIE,
      'ghr_new',
      expect.objectContaining({ maxAge: 15897600 })
    )
  })

  it('refreshes on 403 as well as 401', async () => {
    cookieMap({
      [GH_TOKEN_COOKIE]: 'ghu_stale',
      [GH_REFRESH_COOKIE]: 'ghr_old',
    })
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(403, { message: 'forbidden' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'ghu_fresh',
          refresh_token: 'ghr_new',
        })
      )

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: true,
      token: 'ghu_fresh',
    })
  })

  it('refreshes when the access cookie is missing but a refresh cookie exists', async () => {
    cookieMap({ [GH_REFRESH_COOKIE]: 'ghr_only' })
    ;(global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { access_token: 'ghu_fresh' })
    )

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: true,
      token: 'ghu_fresh',
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      GITHUB_OAUTH_ACCESS_TOKEN_URL,
      expect.any(Object)
    )
  })

  it('falls back to session.provider_token / provider_refresh_token', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          provider_token: 'ghu_session',
          provider_refresh_token: 'ghr_session',
        },
      },
    })
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'ghu_fresh',
          refresh_token: 'ghr_new',
        })
      )

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: true,
      token: 'ghu_fresh',
    })
    expect(mockGetSession).toHaveBeenCalled()
  })

  it('returns REFRESH_FAILED when a stale token has no refresh token', async () => {
    cookieMap({ [GH_TOKEN_COOKIE]: 'ghu_stale' })
    ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, {}))

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.REFRESH_FAILED,
    })
  })

  it('returns NO_ACCESS_TOKEN when the user has neither cookie', async () => {
    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.NO_ACCESS_TOKEN,
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns REFRESH_FAILED when GitHub returns an OAuth error body', async () => {
    cookieMap({ [GH_REFRESH_COOKIE]: 'ghr_dead' })
    ;(global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { error: 'bad_refresh_token' })
    )

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.REFRESH_FAILED,
    })
  })

  it('returns REFRESH_FAILED when GITHUB_CLIENT_ID is missing', async () => {
    delete process.env.GITHUB_CLIENT_ID
    cookieMap({ [GH_REFRESH_COOKIE]: 'ghr_old' })

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.REFRESH_FAILED,
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns REFRESH_FAILED when GITHUB_CLIENT_SECRET is missing', async () => {
    delete process.env.GITHUB_CLIENT_SECRET
    cookieMap({ [GH_REFRESH_COOKIE]: 'ghr_old' })

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.REFRESH_FAILED,
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns REFRESH_FAILED when the refresh request throws', async () => {
    cookieMap({ [GH_REFRESH_COOKIE]: 'ghr_old' })
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('timeout'))

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.REFRESH_FAILED,
    })
  })

  it('returns REFRESH_FAILED when refresh JSON parsing fails', async () => {
    cookieMap({ [GH_REFRESH_COOKIE]: 'ghr_old' })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json')
      },
    } as Response)

    await expect(getFreshGitHubToken()).resolves.toEqual({
      ok: false,
      error: GitHubAuthError.REFRESH_FAILED,
    })
  })
})
