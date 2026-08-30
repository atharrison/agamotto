import Link from 'next/link'

/** Animated control that opens the in-flight review pipeline. */
export function ReviewRunningLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Review in progress"
      title="Review in progress"
      className="inline-flex items-center justify-center rounded-md border border-yellow-800 p-1.5 text-yellow-400 transition hover:border-yellow-600 hover:text-yellow-300"
    >
      <span
        aria-hidden="true"
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent"
      />
    </Link>
  )
}
