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
import {
  loadConventionsDoc,
  loadReviewSettings,
} from '../src/lib/conventions-store'
import { OverlayAgent } from '../src/lib/overlays'

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
  it('stores conventions and overlays under UPPER_CASE keys', () => {
    expect(SettingKey.CONVENTIONS).toBe('CONVENTIONS')
    expect(SettingKey.OVERLAY_CONTEXT).toBe('OVERLAY_CONTEXT')
    expect(SettingKey.OVERLAY_PERFORMANCE).toBe('OVERLAY_PERFORMANCE')
  })
})

describe('DEFAULT_CONVENTIONS', () => {
  it('includes the built-in enum convention', () => {
    expect(DEFAULT_CONVENTIONS).toContain('UPPER_CASE')
    expect(MAX_CONVENTIONS_CHARS).toBeGreaterThan(1000)
  })
})

describe('loadReviewSettings', () => {
  beforeEach(() => {
    mockSelect.mockReset()
    mockFrom.mockReset()
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('returns conventions and overlays from settings rows', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { key: SettingKey.CONVENTIONS, value: 'Prefer named exports' },
        { key: SettingKey.OVERLAY_PERFORMANCE, value: 'Flag useEffect fetch' },
      ],
      error: null,
    })

    const settings = await loadReviewSettings()
    expect(settings.conventionsDoc).toBe('Prefer named exports')
    expect(settings.overlays[OverlayAgent.PERFORMANCE]).toBe(
      'Flag useEffect fetch'
    )
    expect(settings.overlays[OverlayAgent.CONTEXT]).toBe('')
    expect(mockFrom).toHaveBeenCalledWith('settings')
    expect(mockSelect).toHaveBeenCalledWith('key, value')
  })

  it('returns undefined conventions when no row is stored', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null })
    const settings = await loadReviewSettings()
    expect(settings.conventionsDoc).toBeUndefined()
    expect(settings.overlays[OverlayAgent.CONTEXT]).toBe('')
  })

  it('treats a null data payload as empty rows', async () => {
    mockSelect.mockResolvedValue({ data: null, error: null })
    const settings = await loadReviewSettings()
    expect(settings.conventionsDoc).toBeUndefined()
    expect(settings.overlays[OverlayAgent.SECURITY]).toBe('')
  })

  it('returns undefined conventions when the stored value is empty or not a string', async () => {
    mockSelect.mockResolvedValue({
      data: [{ key: SettingKey.CONVENTIONS, value: {} }],
      error: null,
    })
    await expect(loadReviewSettings()).resolves.toMatchObject({
      conventionsDoc: undefined,
    })

    mockSelect.mockResolvedValue({
      data: [{ key: SettingKey.CONVENTIONS, value: '  ' }],
      error: null,
    })
    await expect(loadReviewSettings()).resolves.toMatchObject({
      conventionsDoc: undefined,
    })
  })

  it('returns empty settings on a database error', async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    })
    const settings = await loadReviewSettings()
    expect(settings.conventionsDoc).toBeUndefined()
    expect(settings.overlays[OverlayAgent.STYLE]).toBe('')
  })

  it('returns empty settings when the client throws', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('no supabase')
    })
    const settings = await loadReviewSettings()
    expect(settings.conventionsDoc).toBeUndefined()
  })
})

describe('loadConventionsDoc', () => {
  beforeEach(() => {
    mockSelect.mockReset()
    mockFrom.mockReset()
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('returns the stored markdown when a conventions row exists', async () => {
    mockSelect.mockResolvedValue({
      data: [{ key: SettingKey.CONVENTIONS, value: 'Prefer named exports' }],
      error: null,
    })
    await expect(loadConventionsDoc()).resolves.toBe('Prefer named exports')
  })
})
