import { cookies } from 'next/headers'
import {
  createSupabaseServerClient,
  GH_REFRESH_COOKIE,
  GH_TOKEN_COOKIE,
} from './supabase/server'

export { GH_REFRESH_COOKIE }

export enum GitHubAuthError {
  NO_SESSION = 'NO_SESSION',
  NO_ACCESS_TOKEN = 'NO_ACCESS_TOKEN',
  REFRESH_FAILED = 'REFRESH_FAILED',
}

export const GITHUB_SESSION_EXPIRED_MESSAGE =
  'GitHub session expired — sign in again'

export const GH_ACCESS_TOKEN_MAX_AGE = 60 * 60 * 8
export const GH_REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 180

export const GITHUB_OAUTH_ACCESS_TOKEN_URL =
  'https://github.com/login/oauth/access_token'

const GITHUB_USER_URL = 'https://api.github.com/user'

export type FreshGitHubTokenResult =
  | { ok: true; token: string }
  | { ok: false; error: GitHubAuthError }

export type GitHubOAuthTokens = {
  accessToken: string
  refreshToken?: string
  accessTokenMaxAge: number
  refreshTokenMaxAge: number
}

export function shouldRefreshGitHubToken(status: number): boolean {
  return status === 401 || status === 403
}

export function parseGitHubOAuthTokenResponse(
  body: unknown
): GitHubOAuthTokens | null {
  if (!body || typeof body !== 'object') return null
  const rec = body as Record<string, unknown>
  if (typeof rec.error === 'string') return null
  if (typeof rec.access_token !== 'string' || rec.access_token.length === 0) {
    return null
  }
  return {
    accessToken: rec.access_token,
    refreshToken:
      typeof rec.refresh_token === 'string' ? rec.refresh_token : undefined,
    accessTokenMaxAge:
      typeof rec.expires_in === 'number' && rec.expires_in > 0
        ? rec.expires_in
        : GH_ACCESS_TOKEN_MAX_AGE,
    refreshTokenMaxAge:
      typeof rec.refresh_token_expires_in === 'number' &&
      rec.refresh_token_expires_in > 0
        ? rec.refresh_token_expires_in
        : GH_REFRESH_TOKEN_MAX_AGE,
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export type GitHubCookieStore = {
  set: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean
      secure: boolean
      sameSite: 'lax'
      path: string
      maxAge: number
    }
  ) => void
  delete: (name: string) => void
}

export function setGitHubTokenCookies(
  cookieStore: GitHubCookieStore,
  tokens: {
    accessToken: string
    refreshToken?: string
    accessTokenMaxAge?: number
    refreshTokenMaxAge?: number
  }
): void {
  cookieStore.set(
    GH_TOKEN_COOKIE,
    tokens.accessToken,
    cookieOptions(tokens.accessTokenMaxAge ?? GH_ACCESS_TOKEN_MAX_AGE)
  )
  if (tokens.refreshToken) {
    cookieStore.set(
      GH_REFRESH_COOKIE,
      tokens.refreshToken,
      cookieOptions(tokens.refreshTokenMaxAge ?? GH_REFRESH_TOKEN_MAX_AGE)
    )
  }
}

export function clearGitHubTokenCookies(cookieStore: GitHubCookieStore): void {
  cookieStore.delete(GH_TOKEN_COOKIE)
  cookieStore.delete(GH_REFRESH_COOKIE)
}

async function probeGitHubUser(token: string): Promise<number | null> {
  try {
    const res = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'agamotto',
      },
    })
    return res.status
  } catch {
    return null
  }
}

async function refreshAccessToken(
  refreshToken: string
): Promise<GitHubOAuthTokens | null> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch(GITHUB_OAUTH_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    })
    const body: unknown = await res.json()
    return parseGitHubOAuthTokenResponse(body)
  } catch {
    return null
  }
}

/**
 * Verify the GitHub OAuth user token and refresh it when GitHub rejects it.
 *
 * Returns a typed error instead of a dead cookie token so callers can tell
 * the UI to sign in again (ATH-42) rather than posting with a 403.
 */
export async function getFreshGitHubToken(): Promise<FreshGitHubTokenResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: userData, error } = await supabase.auth.getUser()
    if (error || !userData.user) {
      return { ok: false, error: GitHubAuthError.NO_SESSION }
    }

    const cookieStore = await cookies()
    let accessToken = cookieStore.get(GH_TOKEN_COOKIE)?.value
    let refreshToken = cookieStore.get(GH_REFRESH_COOKIE)?.value

    if (!accessToken || !refreshToken) {
      const { data: sessionData } = await supabase.auth.getSession()
      accessToken =
        accessToken ?? sessionData.session?.provider_token ?? undefined
      refreshToken =
        refreshToken ?? sessionData.session?.provider_refresh_token ?? undefined
    }

    if (accessToken) {
      const status = await probeGitHubUser(accessToken)
      if (status === null || !shouldRefreshGitHubToken(status)) {
        return { ok: true, token: accessToken }
      }
    }

    if (!refreshToken) {
      return {
        ok: false,
        error: accessToken
          ? GitHubAuthError.REFRESH_FAILED
          : GitHubAuthError.NO_ACCESS_TOKEN,
      }
    }

    const refreshed = await refreshAccessToken(refreshToken)
    if (!refreshed) {
      return { ok: false, error: GitHubAuthError.REFRESH_FAILED }
    }

    setGitHubTokenCookies(cookieStore, refreshed)
    return { ok: true, token: refreshed.accessToken }
  } catch {
    return { ok: false, error: GitHubAuthError.NO_SESSION }
  }
}

export function githubTokenFromFresh(
  fresh: FreshGitHubTokenResult
): string | null {
  return fresh.ok ? fresh.token : null
}
