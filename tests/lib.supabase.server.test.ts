/**
 * Tests for src/lib/supabase/server.ts
 * Mocks Next cookies and Supabase factories; asserts the agamotto schema is set.
 */

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: () => [],
    get: () => undefined,
    set: jest.fn(),
  }),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({}),
}))

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn().mockReturnValue({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: null }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import {
  createSupabaseServiceRoleClient,
  createSupabaseServerClient,
} from '../src/lib/supabase/server'

const mockCreateClient = createClient as jest.Mock
const mockCreateServerClient = createServerClient as jest.Mock

describe('createSupabaseServiceRoleClient', () => {
  it('scopes the service-role client to the agamotto schema', () => {
    createSupabaseServiceRoleClient()
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-key',
      { db: { schema: 'agamotto' } }
    )
  })
})

describe('createSupabaseServerClient', () => {
  it('scopes the cookie client to the agamotto schema', async () => {
    await createSupabaseServerClient()
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({ db: { schema: 'agamotto' } })
    )
  })
})
