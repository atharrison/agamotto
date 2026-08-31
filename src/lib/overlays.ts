import { SettingKey } from './conventions'

/** Domain/context agents that accept an append-only operator overlay. */
export enum OverlayAgent {
  CONTEXT = 'CONTEXT',
  CORRECTNESS = 'CORRECTNESS',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  STYLE = 'STYLE',
}

export const OVERLAY_AGENTS = [
  OverlayAgent.CONTEXT,
  OverlayAgent.CORRECTNESS,
  OverlayAgent.SECURITY,
  OverlayAgent.PERFORMANCE,
  OverlayAgent.STYLE,
] as const

export const MAX_OVERLAY_CHARS = 8_000

export const OPERATOR_OVERLAY_OPEN = '<operator-overlay>'
export const OPERATOR_OVERLAY_CLOSE = '</operator-overlay>'

export const OVERLAY_SETTING_KEY: Record<OverlayAgent, SettingKey> = {
  [OverlayAgent.CONTEXT]: SettingKey.OVERLAY_CONTEXT,
  [OverlayAgent.CORRECTNESS]: SettingKey.OVERLAY_CORRECTNESS,
  [OverlayAgent.SECURITY]: SettingKey.OVERLAY_SECURITY,
  [OverlayAgent.PERFORMANCE]: SettingKey.OVERLAY_PERFORMANCE,
  [OverlayAgent.STYLE]: SettingKey.OVERLAY_STYLE,
}

export type AgentOverlays = Record<OverlayAgent, string>

export const EMPTY_OVERLAYS: AgentOverlays = {
  [OverlayAgent.CONTEXT]: '',
  [OverlayAgent.CORRECTNESS]: '',
  [OverlayAgent.SECURITY]: '',
  [OverlayAgent.PERFORMANCE]: '',
  [OverlayAgent.STYLE]: '',
}

export const OVERLAY_AGENT_LABELS: Record<OverlayAgent, string> = {
  [OverlayAgent.CONTEXT]: 'Context',
  [OverlayAgent.CORRECTNESS]: 'Correctness',
  [OverlayAgent.SECURITY]: 'Security',
  [OverlayAgent.PERFORMANCE]: 'Performance',
  [OverlayAgent.STYLE]: 'Style',
}

export function overlayAgentFromSettingKey(
  key: unknown
): OverlayAgent | undefined {
  for (const agent of OVERLAY_AGENTS) {
    if (OVERLAY_SETTING_KEY[agent] === key) return agent
  }
  return undefined
}

/** Non-empty overlay string, or null when the setting should fall back to shipped defaults. */
export function parseOverlayValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Strip delimiter tags so overlay text cannot close the wrapping block early. */
export function stripOverlayDelimiters(text: string): string {
  return text
    .replaceAll(OPERATOR_OVERLAY_OPEN, '')
    .replaceAll(OPERATOR_OVERLAY_CLOSE, '')
}

export function capOverlay(overlay: string | undefined): string | undefined {
  const parsed = parseOverlayValue(overlay)
  if (!parsed) return undefined
  const stripped = stripOverlayDelimiters(parsed).trim()
  if (!stripped) return undefined
  return stripped.length > MAX_OVERLAY_CHARS
    ? stripped.slice(0, MAX_OVERLAY_CHARS)
    : stripped
}

/**
 * Append an operator overlay in a delimited block. Empty overlay = `base` unchanged.
 * Does not include the JSON output contract — callers that need contract-after-overlay
 * should use `assembleSystemPrompt`.
 */
export function appendOperatorOverlay(
  base: string,
  overlay: string | undefined
): string {
  const text = capOverlay(overlay)
  if (!text) return base
  return `${base.trimEnd()}\n\n${OPERATOR_OVERLAY_OPEN}\n${text}\n${OPERATOR_OVERLAY_CLOSE}`
}

/**
 * System prompt = shipped preamble + optional overlay + output contract last.
 * An overlay that tries to redefine the JSON schema cannot win — the contract
 * is always the final block.
 */
export function assembleSystemPrompt(
  preamble: string,
  overlay: string | undefined,
  contract: string
): string {
  const withOverlay = appendOperatorOverlay(preamble, overlay)
  const trimmedContract = contract.trim()
  if (!trimmedContract) return withOverlay
  return `${withOverlay}\n\n${trimmedContract}`
}

export function overlaysFromRows(
  rows: { key?: unknown; value?: unknown }[] | null | undefined
): AgentOverlays {
  const result: AgentOverlays = { ...EMPTY_OVERLAYS }
  if (!rows) return result
  for (const row of rows) {
    const agent = overlayAgentFromSettingKey(row.key)
    if (!agent) continue
    const text = parseOverlayValue(row.value)
    if (text) result[agent] = text
  }
  return result
}
