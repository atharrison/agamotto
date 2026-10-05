'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

/**
 * Signs out via the server route (clears the httpOnly GitHub token cookies
 * that client JS cannot delete) and sends the user to /login. Used where an
 * expired GitHub session needs a fresh sign-in (ATH-61).
 */
export default function SignOutButton({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    setPending(true)
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={className}
    >
      {children}
    </button>
  )
}
