import type { ModelClient } from '../../harness/models'
import type { DomainResult, EnrichedContext } from './schema'
import { buildStyleSystem, styleUserPrompt } from './prompts'
import { parseDomainResult, domainContextJson } from './domain-agent-utils'

export interface DomainAgentOptions {
  enrichedContext: EnrichedContext
  model: ModelClient
  overlay?: string
}

/**
 * Style Agent — single-shot structured output.
 * Receives EnrichedContext, returns DomainResult with STYLE findings.
 */
export async function runStyleAgent(
  options: DomainAgentOptions
): Promise<DomainResult> {
  const { enrichedContext, model, overlay } = options
  const start = Date.now()

  const contextJson = domainContextJson(enrichedContext)
  const userPrompt = styleUserPrompt(contextJson)

  const reply = await model.chat(
    [{ role: 'user', content: userPrompt }],
    [], // no tools — single-shot
    buildStyleSystem(overlay)
  )

  const durationMs = Date.now() - start
  return parseDomainResult(
    reply.text,
    'STYLE',
    durationMs,
    reply.usage.inputTokens + reply.usage.outputTokens,
    reply.cost
  )
}
