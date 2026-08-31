import type { ModelClient } from '../../harness/models'
import type { DomainResult, EnrichedContext } from './schema'
import { buildCorrectnessSystem, correctnessUserPrompt } from './prompts'
import { parseDomainResult, domainContextJson } from './domain-agent-utils'

export interface DomainAgentOptions {
  enrichedContext: EnrichedContext
  model: ModelClient
  overlay?: string
}

/**
 * Correctness Agent — single-shot structured output.
 * Receives EnrichedContext, returns DomainResult with CORRECTNESS findings.
 */
export async function runCorrectnessAgent(
  options: DomainAgentOptions
): Promise<DomainResult> {
  const { enrichedContext, model, overlay } = options
  const start = Date.now()

  const contextJson = domainContextJson(enrichedContext)
  const userPrompt = correctnessUserPrompt(contextJson)

  const reply = await model.chat(
    [{ role: 'user', content: userPrompt }],
    [], // no tools — single-shot
    buildCorrectnessSystem(overlay)
  )

  const durationMs = Date.now() - start
  return parseDomainResult(
    reply.text,
    'CORRECTNESS',
    durationMs,
    reply.usage.inputTokens + reply.usage.outputTokens,
    reply.cost
  )
}
