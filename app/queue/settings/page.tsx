import Link from 'next/link'
import { createSupabaseServerClient } from '../../../src/lib/supabase/server'
import { settingsBackLink } from '../../../src/lib/settings-back'
import {
  DEFAULT_CONVENTIONS,
  SettingKey,
  parseConventionsValue,
} from '../../../src/lib/conventions'
import { isAdminGithubUser } from '../../../src/lib/github-users'
import ReposManager from './ReposManager'
import ConventionsEditor from './ConventionsEditor'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ from?: string }>
}

export default async function QueueSettingsPage({ searchParams }: Props) {
  const { from } = await searchParams
  const back = settingsBackLink(from)
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAdmin = isAdminGithubUser(user)

  const [{ data: reposData }, { data: conventionsRow }] = await Promise.all([
    supabase.from('configured_repos').select('*').order('owner').order('name'),
    supabase
      .from('settings')
      .select('value')
      .eq('key', SettingKey.CONVENTIONS)
      .maybeSingle(),
  ])

  const customDoc = parseConventionsValue(conventionsRow?.value)

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
        <ReposManager initialRepos={reposData ?? []} isAdmin={isAdmin} />
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold text-white">
          Team conventions
        </h2>
        <p className="mb-4 text-sm text-gray-400">
          Markdown the conventions agent applies at review time. If nothing is
          saved, reviews use the built-in defaults.
        </p>
        <ConventionsEditor
          initialMarkdown={customDoc ?? DEFAULT_CONVENTIONS}
          isCustom={customDoc !== null}
          isAdmin={isAdmin}
        />
      </section>
    </div>
  )
}
