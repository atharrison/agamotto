import { SettingsFrom, settingsBackLink } from '../src/lib/settings-back'

describe('settingsBackLink', () => {
  it('returns History when from=history', () => {
    expect(settingsBackLink('history')).toEqual({
      href: '/history',
      label: 'History',
    })
  })

  it('accepts UPPER_CASE from values', () => {
    expect(settingsBackLink(SettingsFrom.HISTORY)).toEqual({
      href: '/history',
      label: 'History',
    })
  })

  it('returns Queue when from is missing or unknown', () => {
    expect(settingsBackLink(undefined)).toEqual({
      href: '/queue',
      label: 'Queue',
    })
    expect(settingsBackLink('queue')).toEqual({
      href: '/queue',
      label: 'Queue',
    })
    expect(settingsBackLink('nope')).toEqual({
      href: '/queue',
      label: 'Queue',
    })
  })
})
