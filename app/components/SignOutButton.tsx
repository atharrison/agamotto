'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

/**
 * Signs out via the server route (clears the httpOnly GitHub token cookies
 * that client JS cannot delete) and sends the user to /login. Used where an
 * expired GitHub session needs a fresh sign-in (ATH-61).
 *
 * Only navigates once the server confirms sign-out; otherwise the cookies are
 * still set and /login would bounce straight back into the stale session.
 */
export function SignOutButton({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleClick() {
    setPending(true)
    setFailed(false)
    try {
      const res = await fetch('/api/auth/signout', { method: 'POST' })
      if (!res.ok) throw new Error(`signout failed: ${res.status}`)
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('[SignOutButton] sign-out failed', err)
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={className}
      >
        {children}
      </button>
      {failed && (
        <p className="mt-2 text-xs text-red-300">
          Sign-out failed — use the user menu to sign out, then try again.
        </p>
      )}
    </>
  )
}
