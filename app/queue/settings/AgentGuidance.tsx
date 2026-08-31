'use client'

import { useState } from 'react'
import {
  OverlayAgent,
  OVERLAY_AGENTS,
  OVERLAY_AGENT_LABELS,
  type AgentOverlays,
} from '../../../src/lib/overlays'
import {
  CONTEXT_AGENT_OUTPUT_CONTRACT,
  CONTEXT_AGENT_SYSTEM,
  CORRECTNESS_SYSTEM,
  PERFORMANCE_SYSTEM,
  SECURITY_SYSTEM,
  STYLE_SYSTEM,
} from '../../../src/agents/pr-review/prompts'
import OverlayEditor from './OverlayEditor'
import ConventionsEditor from './ConventionsEditor'

const CONVENTIONS_TAB = 'CONVENTIONS' as const

type GuidanceTab = OverlayAgent | typeof CONVENTIONS_TAB

const SHIPPED: Record<OverlayAgent, { preamble: string; contract?: string }> = {
  [OverlayAgent.CONTEXT]: {
    preamble: CONTEXT_AGENT_SYSTEM,
    contract: CONTEXT_AGENT_OUTPUT_CONTRACT,
  },
  [OverlayAgent.CORRECTNESS]: { preamble: CORRECTNESS_SYSTEM },
  [OverlayAgent.SECURITY]: { preamble: SECURITY_SYSTEM },
  [OverlayAgent.PERFORMANCE]: { preamble: PERFORMANCE_SYSTEM },
  [OverlayAgent.STYLE]: { preamble: STYLE_SYSTEM },
}

const GLOBAL_DESCRIPTION =
  'Coding standards the conventions agent enforces for every review. This replaces the shipped bullet list rather than appending to it. If nothing is saved, reviews use the built-in defaults.'

const OVERLAY_DESCRIPTION =
  'Extra process appended to one specialist at review time. Empty overlay = that agent uses the shipped prompt only. Overlays cannot redefine the JSON output contract.'

function tabClass(selected: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm transition ${
    selected
      ? 'bg-indigo-600 text-white'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
  }`
}

export default function AgentGuidance({
  overlays,
  conventionsMarkdown,
  conventionsIsCustom,
  isAdmin,
}: {
  overlays: AgentOverlays
  conventionsMarkdown: string
  conventionsIsCustom: boolean
  isAdmin: boolean
}) {
  const [tab, setTab] = useState<GuidanceTab>(CONVENTIONS_TAB)
  const isGlobal = tab === CONVENTIONS_TAB

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Agent guidance"
        className="flex flex-col gap-4 border-b border-gray-800 pb-2 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
            Global
          </p>
          <button
            type="button"
            role="tab"
            aria-selected={isGlobal}
            onClick={() => setTab(CONVENTIONS_TAB)}
            className={tabClass(isGlobal)}
          >
            Conventions
          </button>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 sm:text-right">
            Per-agent
          </p>
          <div className="flex flex-wrap gap-1 sm:justify-end">
            {OVERLAY_AGENTS.map(id => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={tabClass(tab === id)}
              >
                {OVERLAY_AGENT_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-400">
        {isGlobal ? GLOBAL_DESCRIPTION : OVERLAY_DESCRIPTION}
      </p>

      {isGlobal ? (
        <ConventionsEditor
          initialMarkdown={conventionsMarkdown}
          isCustom={conventionsIsCustom}
          isAdmin={isAdmin}
        />
      ) : (
        <OverlayEditor
          key={tab}
          agent={tab}
          initialOverlay={overlays[tab]}
          isAdmin={isAdmin}
          preamble={SHIPPED[tab].preamble}
          contract={SHIPPED[tab].contract}
        />
      )}
    </div>
  )
}
