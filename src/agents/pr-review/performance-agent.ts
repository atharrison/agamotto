import type { ModelClient } from '../../harness/models'
import type { DomainResult, EnrichedContext } from './schema'
import { PERFORMANCE_SYSTEM, performanceUserPrompt } from './prompts'
import { parseDomainResult, domainContextJson } from './domain-agent-utils'

export interface DomainAgentOptions {
  enrichedContext: EnrichedContext
  model: ModelClient
}

/**
 * Performance Agent — single-shot structured output.
 * Receives EnrichedContext, returns DomainResult with PERFORMANCE findings.
 */
export async function runPerformanceAgent(
  options: DomainAgentOptions
): Promise<DomainResult> {
  const { enrichedContext, model } = options
  const start = Date.now()

  const contextJson = domainContextJson(enrichedContext)
  const userPrompt = performanceUserPrompt(contextJson)

  const reply = await model.chat(
    [{ role: 'user', content: userPrompt }],
    [], // no tools — single-shot
    PERFORMANCE_SYSTEM
  )

  const durationMs = Date.now() - start
  return parseDomainResult(
    reply.text,
    'PERFORMANCE',
    durationMs,
    reply.usage.inputTokens + reply.usage.outputTokens,
    reply.cost
  )
}
