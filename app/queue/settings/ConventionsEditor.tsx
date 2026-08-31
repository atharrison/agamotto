'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_CONVENTIONS } from '../../../src/lib/conventions'

export default function ConventionsEditor({
  initialMarkdown,
  isCustom,
  isAdmin,
}: {
  initialMarkdown: string
  isCustom: boolean
  isAdmin: boolean
}) {
  const router = useRouter()
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Re-sync after router.refresh() replaces server props with the saved doc.
  useEffect(() => {
    setMarkdown(initialMarkdown)
  }, [initialMarkdown])

  const dirty = markdown !== initialMarkdown

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
        body: JSON.stringify({ markdown }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to save conventions')
        return
      }
      setSuccess(
        data.isCustom
          ? 'Saved team conventions'
          : 'Cleared — reviews will use built-in defaults'
      )
      setMarkdown(data.markdown)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  function handleResetDefaults() {
    setMarkdown(DEFAULT_CONVENTIONS)
    setError(null)
    setSuccess(null)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <textarea
        value={markdown}
        onChange={e => {
          setMarkdown(e.target.value)
          setSuccess(null)
        }}
        readOnly={!isAdmin}
        spellCheck={false}
        rows={14}
        aria-label="Team coding conventions"
        className="w-full resize-y rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 font-mono text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
      />

      {!isAdmin && (
        <p className="text-sm text-gray-500">
          Only admins can change conventions. Ask a listed admin if this needs
          an update.
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
            {saving ? 'Saving…' : 'Save conventions'}
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={saving || markdown === DEFAULT_CONVENTIONS}
            className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition hover:border-gray-500 hover:text-white disabled:opacity-50"
          >
            Reset to defaults
          </button>
          {isCustom && (
            <span className="text-xs text-gray-500">Custom doc stored</span>
          )}
        </div>
      )}
    </form>
  )
}
