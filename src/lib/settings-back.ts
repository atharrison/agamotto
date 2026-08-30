/** Where Settings was opened from. Query `from` is lower-case at the URL. */
export enum SettingsFrom {
  QUEUE = 'QUEUE',
  HISTORY = 'HISTORY',
}

/** Back-link for `/queue/settings`. Unknown or missing `from` returns Queue. */
export function settingsBackLink(from: string | undefined): {
  href: string
  label: string
} {
  if (from?.toUpperCase() === SettingsFrom.HISTORY) {
    return { href: '/history', label: 'History' }
  }
  return { href: '/queue', label: 'Queue' }
}
