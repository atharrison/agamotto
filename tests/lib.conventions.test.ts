const mockMaybeSingle = jest.fn()
const mockEq = jest.fn()
const mockSelect = jest.fn()
const mockFrom = jest.fn()

jest.mock('../src/lib/supabase/server', () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

import {
  DEFAULT_CONVENTIONS,
  MAX_CONVENTIONS_CHARS,
  SettingKey,
  parseConventionsValue,
} from '../src/lib/conventions'
import { loadConventionsDoc } from '../src/lib/conventions-store'

describe('parseConventionsValue', () => {
  it('returns trimmed markdown for a non-empty string', () => {
    expect(parseConventionsValue('  use enums  \n')).toBe('use enums')
  })

  it('returns null for empty, whitespace, non-strings, and objects', () => {
    expect(parseConventionsValue('')).toBeNull()
    expect(parseConventionsValue('   \n')).toBeNull()
    expect(parseConventionsValue(null)).toBeNull()
    expect(parseConventionsValue(undefined)).toBeNull()
    expect(parseConventionsValue(42)).toBeNull()
    expect(parseConventionsValue({})).toBeNull()
    expect(parseConventionsValue({ markdown: 'nope' })).toBeNull()
  })
})

describe('SettingKey', () => {
  it('stores conventions under an UPPER_CASE key', () => {
    expect(SettingKey.CONVENTIONS).toBe('CONVENTIONS')
  })
})

describe('DEFAULT_CONVENTIONS', () => {
  it('includes the built-in enum convention', () => {
    expect(DEFAULT_CONVENTIONS).toContain('UPPER_CASE')
    expect(MAX_CONVENTIONS_CHARS).toBeGreaterThan(1000)
  })
})

describe('loadConventionsDoc', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset()
    mockEq.mockReset()
    mockSelect.mockReset()
    mockFrom.mockReset()
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('returns the stored markdown when a conventions row exists', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { value: 'Prefer named exports' },
      error: null,
    })

    await expect(loadConventionsDoc()).resolves.toBe('Prefer named exports')
    expect(mockFrom).toHaveBeenCalledWith('settings')
    expect(mockSelect).toHaveBeenCalledWith('value')
    expect(mockEq).toHaveBeenCalledWith('key', SettingKey.CONVENTIONS)
  })

  it('returns undefined when no row is stored', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(loadConventionsDoc()).resolves.toBeUndefined()
  })

  it('returns undefined when the stored value is empty or not a string', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { value: {} }, error: null })
    await expect(loadConventionsDoc()).resolves.toBeUndefined()

    mockMaybeSingle.mockResolvedValue({ data: { value: '  ' }, error: null })
    await expect(loadConventionsDoc()).resolves.toBeUndefined()
  })

  it('returns undefined on a database error', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    })
    await expect(loadConventionsDoc()).resolves.toBeUndefined()
  })

  it('returns undefined when the client throws', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('no supabase')
    })
    await expect(loadConventionsDoc()).resolves.toBeUndefined()
  })
})
