import Link from 'next/link'
import { createSupabaseServerClient } from '../../../src/lib/supabase/server'
import { settingsBackLink } from '../../../src/lib/settings-back'
import ReposManager from './ReposManager'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ from?: string }>
}

export default async function QueueSettingsPage({ searchParams }: Props) {
  const { from } = await searchParams
  const back = settingsBackLink(from)
  const supabase = await createSupabaseServerClient()
  const { data: reposData } = await supabase
    .from('configured_repos')
    .select('*')
    .order('owner')
    .order('name')

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href={back.href}
          className="text-sm text-gray-500 transition hover:text-gray-300"
        >
          ← {back.label}
        </Link>
        <span className="text-gray-700">/</span>
        <h1 className="text-xl font-bold tracking-tight text-white">
          Settings
        </h1>
      </div>

      <section>
        <h2 className="mb-1 text-base font-semibold text-white">
          Configured Repos
        </h2>
        <p className="mb-4 text-sm text-gray-400">
          Repos registered for PR tracking. PRs are added automatically when a
          webhook fires, or manually from the queue. History lists GitHub PRs
          for these repos.
        </p>
        <ReposManager initialRepos={reposData ?? []} />
      </section>
    </div>
  )
}
