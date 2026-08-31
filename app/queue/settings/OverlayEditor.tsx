'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MAX_OVERLAY_CHARS,
  OverlayAgent,
  OVERLAY_AGENT_LABELS,
} from '../../../src/lib/overlays'

export function OverlayEditor({
  agent,
  initialOverlay,
  isAdmin,
  preamble,
  contract,
}: {
  agent: OverlayAgent
  initialOverlay: string
  isAdmin: boolean
  preamble: string
  contract?: string
}) {
  const router = useRouter()
  const [overlay, setOverlay] = useState(initialOverlay)
  const [savedOverlay, setSavedOverlay] = useState(initialOverlay)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    setOverlay(initialOverlay)
    setSavedOverlay(initialOverlay)
  }, [initialOverlay])

  const dirty = overlay !== savedOverlay
  const isCustom = savedOverlay.trim().length > 0
  const label = OVERLAY_AGENT_LABELS[agent]

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!isAdmin) return
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const res = await fetch('/api/queue/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, overlay }),
      })
      let data: { error?: string; overlay?: unknown; isCustom?: boolean }
      try {
        data = await res.json()
      } catch {
        setError(
          res.ok
            ? 'Saved, but the response was unreadable. Refresh to confirm.'
            : 'Failed to save overlay'
        )
        return
      }
      if (!res.ok) {
        setError(data.error ?? 'Failed to save overlay')
        return
      }
      const next = typeof data.overlay === 'string' ? data.overlay : overlay
      setSuccess(
        data.isCustom
          ? `Saved ${label} overlay`
          : `Cleared — ${label} reviews will use the shipped prompt`
      )
      setOverlay(next)
      setSavedOverlay(next)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  function handleResetDefaults() {
    setOverlay('')
    setError(null)
    setSuccess(null)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <details className="rounded-lg border border-gray-800 bg-gray-950/60">
        <summary className="cursor-pointer px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
          Shipped {label} prompt (read-only)
        </summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs text-gray-400">
          {preamble}
        </pre>
      </details>

      <div>
        <label className="mb-1 block text-sm text-gray-400">
          Operator overlay (appended at review time)
        </label>
        <textarea
          value={overlay}
          onChange={e => {
            setOverlay(e.target.value)
            setSuccess(null)
          }}
          readOnly={!isAdmin}
          spellCheck={false}
          rows={8}
          maxLength={MAX_OVERLAY_CHARS}
          aria-label={`${label} operator overlay`}
          placeholder="Empty = shipped defaults. Extra process or house rules only — do not redefine the JSON schema or tool names."
          className="w-full resize-y rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 font-mono text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
        />
        <p className="mt-1 text-right text-xs text-gray-600">
          {overlay.length} / {MAX_OVERLAY_CHARS}
        </p>
      </div>

      {contract && (
        <details className="rounded-lg border border-gray-800 bg-gray-950/60">
          <summary className="cursor-pointer px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
            Output contract (always last — overlays cannot replace this)
          </summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs text-gray-400">
            {contract}
          </pre>
        </details>
      )}

      {!isAdmin && (
        <p className="text-sm text-gray-500">
          Only admins can change agent guidance. Ask a listed admin if this
          needs an update.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-green-800 bg-green-950/30 px-3 py-2 text-sm text-green-400">
          ✓ {success}
        </p>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving || !dirty}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save ${label} overlay`}
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={saving || overlay === ''}
            className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition hover:border-gray-500 hover:text-white disabled:opacity-50"
          >
            Reset to default
          </button>
          {isCustom && (
            <span className="text-xs text-gray-500">Custom overlay stored</span>
          )}
        </div>
      )}
    </form>
  )
}
