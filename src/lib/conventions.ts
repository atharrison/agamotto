/** Key-value rows in `agamotto.settings`. String values are UPPER_CASE. */
export enum SettingKey {
  CONVENTIONS = 'CONVENTIONS',
}

export const MAX_CONVENTIONS_CHARS = 50_000

export const DEFAULT_CONVENTIONS = `
- Prefer named exports over default exports
- Use enums with UPPER_CASE string values instead of magic strings
- Extract shared utilities rather than duplicating logic
- Use consistent naming: camelCase for variables/functions, PascalCase for types/classes
- Imports ordered: built-ins → external packages → internal modules
`.trim()

/** Non-empty markdown string, or null when the setting should fall back to defaults. */
export function parseConventionsValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
