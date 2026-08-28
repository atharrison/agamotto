> **Starting a new session?** Run `/current-state` to orient before starting work.

---

# Session State — 2026-08-27 02:09

## Context

ATH-40 closed. Agamotto is live at https://agamotto.up.railway.app (Railway `agamotto-web`). Hosted schema is `agamotto`; GitHub Actions `db push` applies migrations. Queue Start Review 401 was leftover `ACCESS_PASSWORDS`, not the new repo.

## Decisions Made

- **Single baseline, no SET SCHEMA for self-hosters**: `20260827000000_initial_agamotto_schema.sql` only. Hosted tables were moved earlier; `schema_migrations` repaired so the baseline looks applied (SQL never re-ran).
- **Apply hosted SQL via migration + merge**, not the SQL editor. PR #4 granted `USAGE` on schema `agamotto` (SET SCHEMA does not copy schema grants; 42501).
- **GitHub session skips `ACCESS_PASSWORDS`** on `POST /api/review/start` (PR #5). Anonymous homepage still uses the env var. Check GitHub identity; skip `getUser` when the code gate is already open.
- **Webhook secret is `configured_repos.webhook_secret`**, not a Railway env var. ATH-36 still needed for UI. Both repos’ GitHub hooks now point at `agamotto.up.railway.app/api/webhooks/github`.

## Tickets Touched

- **ATH-40**: Done. PRs #1–#3 rebrand/schema; #4 grants; #5 session skip. Linear closed.

## What Was Tried and Abandoned

- Pasting GRANT SQL in the dashboard: Andrew rejected — use a migration PR.
- Treating `/queue` 200 as API health: HTML only; GET `/api/queue` uses service_role, add-repo uses `authenticated`.

## Open Questions / Blockers

- Smoke-test Start Review after Railway deploys #5. Manual queue add of a closed PR still shows OPEN until webhook/`CLOSED`.
- ATH-36 webhook secret UI; `ACCESS_PASSWORDS` still set on Railway (homepage gate).

## Next Steps

1. Confirm queue Start Review 202 after #5 deploy.
2. **ATH-20** self-hosting guide (`docs/SELF_HOSTING.md`).
3. Optional: ATH-37 queue auto-refresh, ATH-30 queue → past review.

## Key Files

- `supabase/migrations/20260827000000_initial_agamotto_schema.sql`, `…10000_grant_agamotto_schema_privileges.sql`
- `app/api/review/start/route.ts` — GitHub session vs access code
- `.github/workflows/supabase-deploy.yml` — `db push` on main
- Types: `src/types/database.types.ts` (not `src/lib/`)

---

# Session State — 2026-08-26 22:59

## Context

**This repo (gauntlet-harness) has been forked into a new project named Agamotto.**
New repo: https://github.com/atharrison/agamotto — domain: https://agamotto.dev (registered tonight on Squarespace).
gauntlet-harness stays as the legacy/archive repo. All future work happens in agamotto.

## Decisions Made

- **Project name: Agamotto** — Eye of Agamotto (MCU/Doctor Strange), all-seeing artifact. Brainstormed ~30 candidates tonight; Prism/Karnak/Enki/Heimdall/Wintermute all eliminated for conflicts. agamotto.dev and npm `agamotto` were both clean.
- **DB schema: `agamotto`** (not `public`) — migration `20260827000000_rename_schema_to_agamotto.sql` moves all 7 tables + 2 helper functions via `ALTER TABLE ... SET SCHEMA`. Grants re-applied. config.toml updated.
- **ATH-40 branch was NOT merged into gauntlet-harness** — changes were rsync'd into the new agamotto repo instead. Branch deleted.

## Tickets Touched

- **ATH-40**: Created (schema rename + UI rebrand). Work lives in agamotto repo as initial commit, not in gauntlet-harness.

## Next Steps (in the **agamotto** workspace, not here)

1. Update `package.json`: `name` → `"agamotto"`, `description` → something fitting
2. `supabase db reset` — apply the migration locally
3. `supabase gen types typescript --local > src/lib/database.types.ts`
4. Commit the above, then tackle **ATH-20** (self-hosting guide: `docs/SELF_HOSTING.md`)

## Key Files (in agamotto repo)

- `supabase/migrations/20260827000000_rename_schema_to_agamotto.sql` — the schema rename
- `src/lib/supabase/server.ts` — both clients now pass `db: { schema: 'agamotto' }`
- `supabase/config.toml` — agamotto added to `schemas` + `extra_search_path`
- `app/layout.tsx` — title/header rebranded to "Agamotto"

---

# Session State — 2026-08-24 23:30

## Context

Gauntlet Harness — ATH-38 (PR #23) and ATH-15 (PR #24) both merged tonight. On `main`. Local MCP now talks to CLI Postgres, not cloud.

## Decisions Made

- **`review_count` is trigger-only**: `tracked_prs_on_reviewed` increments it; app upserts never write that column (would double-count)
- **Start mints `reviews` then upserts `tracked_prs`**: needed for `last_review_id` FK; if `createReview` fails, omit `last_review_id` (nullable) and still flip IN_REVIEW
- **CLOSED → IN_REVIEW is intentional**: user-triggered start records intent; do not filter CLOSED on the upsert (PR #24 round-2 finding, Andrew confirmed)
- **Do not treat unique-constraint as success on `createReview`**: losing concurrent SSE insert should abort, not run two pipelines
- **Local Supabase MCP**: `~/.cursor/mcp.json` `supabase` → `http://localhost:54321/mcp` (no OAuth); `supabase-cloud` kept for hosted

## Tickets Touched

- **ATH-38**: Done ✅ (PR #23)
- **ATH-15**: Done ✅ (PR #24) — local verify: PR #24 `review_count=2`, `last_review_id` = second COMMENT review
- **ATH-39**: Created (Backlog) — inventing BLOCKING findings from truncated/indent-only diffs; complementary to ATH-35

## What Was Tried and Abandoned

- Filtering CLOSED on upsert: rejected — starting a review is explicit user intent
- Unique-as-success / ON CONFLICT DO NOTHING in `createReview`: declined — worsens double-pipeline race

## Open Questions / Blockers

- CLOSED→IN_REVIEW JSDoc/test did not land in #24 (uncommitted when we switched to main)
- Production webhook still not wired (ATH-36)
- ATH-28 32 KB cap still not enough for this repo's PRs (ATH-39)

## Next Steps

1. ATH-30 (queue → past review output) or ATH-37 (queue auto-refresh)
2. ATH-39 / ATH-35 (review quality) when ready
3. Optional: commit the CLOSED-intent JSDoc on a tiny follow-up

## Key Files

- `src/lib/tracked-prs.ts`, `src/memory/tracked-pr-store.ts` — lifecycle payloads/I/O
- `app/api/review/start/route.ts`, `app/api/review/[id]/route.ts`, `finalize/route.ts`
- `~/.cursor/mcp.json` — local vs cloud Supabase MCP

---

# Session State — 2026-08-19 22:45

## Context

Gauntlet Harness — shipped ATH-17 (Conventions, Performance, and Style agents) via PR #22, merged tonight. Also fixed two bugs discovered via self-review: silent Zod error swallowing in parseDomainResult, and NITs not appearing in the posted GitHub comment.

## Decisions Made

- **`parseDomainResult` extracted to `domain-agent-utils.ts`**: eliminates copy-paste across all 5 agent files; fixes silent Zod validation failures (now warns explicitly) and ensures bug fixes propagate to all agents automatically
- **`conventionsDoc?: string` in `RunReviewOptions`**: conventions agent accepts optional team conventions doc threaded from coordinator; falls back to built-in defaults; ready for ATH-23 (in-app editor) with no coordinator changes
- **NIT section added to `formatGitHubComment`**: NITs were accepted in the UI but silently dropped — no rendering block existed for them; added `### 💬 Nits` section, only renders when user explicitly accepts a NIT
- **OUTPUT checkpoint as authoritative DOMAIN→done signal**: removed hardcoded `>= 5` agent count from ReviewShell; DOMAIN phase now transitions on OUTPUT checkpoint (server-authoritative), so UI never hangs if an agent fails to emit its checkpoint
- **ATH-38 created**: OTel tracing optional (`OTEL_TRACES_EXPORTER=none`) — no off switch existed for local dev console noise

## Tickets Touched

- **ATH-17**: Done ✅ (PR #22 merged — conventions/performance/style agents + domain-agent-utils refactor + NIT rendering + DOMAIN phase hang fix)
- **ATH-38**: Created — make OTel tracing optional for local dev

## Open Questions / Blockers

- Production webhook still not wired (ATH-36 prerequisite)
- `conventionsDoc` loading from Supabase `settings` deferred to ATH-23

## Next Steps

1. ATH-38 (OTel `OTEL_TRACES_EXPORTER=none`) — quick win, reduce local dev console noise
2. ATH-15 (wire `tracked_prs` to review lifecycle) — closes the loop so queue → review → done is tracked
3. ATH-30 (link queue rows to past review output) — pairs naturally after ATH-15

## Key Files

- `src/agents/pr-review/domain-agent-utils.ts` — shared parseDomainResult (new)
- `src/agents/pr-review/conventions-agent.ts`, `performance-agent.ts`, `style-agent.ts` — new domain agents
- `src/agents/pr-review/approval.ts` — NIT section added to formatGitHubComment
- `app/review/[id]/ReviewShell.tsx` — DOMAIN phase hang fix (OUTPUT checkpoint-driven)

---

# Session State — 2026-08-17 22:28

## Context

Gauntlet Harness — shipped ATH-16 (GitHub webhook receiver, PR #20) and ATH-31 (bypass URL entry from queue, PR #21). Both merged. 5+ review rounds on ATH-16; 2 rounds on ATH-31. Multiple new backlog tickets created; MVP/Remaining milestones set up.

## Decisions Made

- **Full auth before event-type branch** in webhook route: HMAC verification and DB lookup happen before checking `x-github-event`, so non-`pull_request` events still go through full auth (→ 204 after auth)
- **`TIMING_DUMMY_SECRET` pattern**: unknown-repo and null-secret paths perform a dummy `verifyGitHubSignature` call to equalize timing and prevent repo enumeration
- **All 401 bodies identical**: `{ error: 'Unauthorized' }` regardless of failure reason — prevents enumeration
- **`reopened` uses `.update()` not upsert**: explicitly sets `updated_since_review: false` for deterministic state; avoids overwriting fields not owned by reopened event
- **`startingId → Set<string>`** in QueueDisplay: per-row loading state; prevents race where clicking two PRs rapidly re-enables first row's button
- **`res.text()` on error path**: avoids throw when server returns non-JSON (e.g. 502 HTML)

## Tickets Touched

- **ATH-16**: Done ✅ (PR #20 merged)
- **ATH-31**: Done ✅ (PR #21 merged — review-driven hardening in final two commits)
- **ATH-30, 32, 33, 34, 35, 36, 37**: All created in backlog; MVP vs Remaining milestones assigned

## Open Questions / Blockers

- Production webhook not yet wired: need `GITHUB_WEBHOOK_SECRET` Railway env var + GitHub repo webhook configured pointing to `/api/webhooks/github`
- ATH-36 (webhook secret UI) blocks clean self-serve webhook setup

## Next Steps

1. Wire webhook in production: add `GITHUB_WEBHOOK_SECRET` to Railway, configure GitHub repo webhook
2. ATH-37 (queue auto-refresh + manual refresh button) — small, good next ticket
3. ATH-30 (link queue rows to past review output) — pairs well with ATH-37

## Key Files

- `app/api/webhooks/github/route.ts` — webhook receiver (full auth before event branch)
- `src/lib/webhook.ts` — HMAC verify/compute utilities
- `tests/api.webhooks.github.test.ts` — webhook route tests
- `app/queue/QueueDisplay.tsx` — queue UI with hardened handleStartReview

---

# Session State — 2026-08-16 23:23

## Context

Gauntlet Harness — AI-powered PR review tool. Sprint 1 MVP is fully merged and live in production. This session continued from the previous one, shipping ATH-22 and ATH-28 via PR #19 (merged).

## What Was Done This Session

- **ATH-27** (coverage cleanup) merged via PR #18 — responded to review, fixed `mockAnonClient.current` baseline reset
- **Production go-live** — fixed OAuth redirect loop (Supabase provider not enabled, Site URL pointed to localhost, `request.url` returning `0.0.0.0:8080`); added `NEXT_PUBLIC_SITE_URL` env var + `x-forwarded-host` header fallback in auth callback
- **ATH-22** merged via PR #19 — env var startup validation (`src/harness/env.ts` + `instrumentation.ts`), `setReviewSubmission` 500 hardening, SSE error sanitization; 224 tests / 24 suites
- **ATH-28** merged in same PR #19 — `fetch_pr_files` patch limit 8 KB → 32 KB + sentinel on truncation; eliminates false "placeholder code" review findings
- Created **ATH-29** — review comment preview + edit before posting to GitHub
- Created **ATH-28** — diff truncation bug (now Done)

## Decisions Made

- **`process.exit(1)` over `throw`** in `validateEnv()`: throwing lets Next.js wrap the error with its own noisy error block; `process.exit` gives clean output
- **32 KB patch limit** (up from 8 KB): covers typical test files without hitting model context limits; sentinel appended on overflow so agents know content was cut
- **ATH-28 bundled into PR #19**: small and directly related to review quality; no reason to make it a separate PR
- **Concurrent pipeline race (INSERT ON CONFLICT)**: explicitly deferred — not in ATH-22 scope, no ticket yet

## Tickets Touched

- **ATH-22**: Done ✅ (merged PR #19)
- **ATH-27**: Done ✅ (merged PR #18, earlier in session)
- **ATH-28**: Done ✅ (shipped in PR #19)
- **ATH-29**: Created — review comment preview + edit before posting to GitHub

## Open Questions

- Review harness still sees two consecutive "REQUEST_CHANGES" on PR #19 due to diff truncation. Now that ATH-28 is merged, next PR review should get complete diffs. Worth smoke-testing on the next PR.
- Concurrent pipeline race condition still unguarded — worth a ticket before adding more traffic.

## Next Steps

1. Smoke-test a real end-to-end review in production (PRs should now get full diffs)
2. Pick next feature ticket — candidates: ATH-16 (GitHub webhook), ATH-18 (wire search_past_reviews), ATH-19 (review history page), ATH-29 (comment preview/edit)
3. File concurrent pipeline race ticket before it becomes a real incident

## Key Files

- `src/harness/env.ts` — new startup validation module
- `src/tools/github.ts` — patch limit now 32 KB + sentinel
- `app/api/auth/callback/route.ts` — `x-forwarded-host` origin fix + `NEXT_PUBLIC_SITE_URL` override
- `app/api/review/[id]/finalize/route.ts` — `setReviewSubmission` 500 hardening (both paths)
- `app/api/review/[id]/route.ts` — SSE error sanitization

---

# Session State — 2026-08-16 22:15

## Context

Gauntlet Harness — AI-powered PR review tool. Sprint 1 MVP tickets are merged. App is live in production on Railway.

## What Was Done This Session

- **ATH-27** (test coverage cleanup) merged via PR #18 — overall coverage 74.7% → 87.6%
- Responded to PR #18 review: fixed `mockAnonClient.current` baseline reset in GET /api/queue/repos `beforeEach`; clarified false "placeholder tests" finding (reviewer's diff was truncated)
- Created **ATH-28** — bug ticket for review harness truncating long diff hunks causing false positives
- **Production deployment** — fixed OAuth redirect loop:
  - Supabase GitHub provider was not enabled → enabled it with prod OAuth App credentials
  - Supabase Site URL pointed to localhost → updated to Railway URL
  - `request.url` in auth callback returned `0.0.0.0:8080` (Railway internal) → fixed by reading `x-forwarded-host`/`x-forwarded-proto` headers, with `NEXT_PUBLIC_SITE_URL` env var as explicit override
  - Added `NEXT_PUBLIC_SITE_URL` to `.env.example`
  - Committed as `e0f0d0d Adding NEXT_PUBLIC_SITE_URL`
- App is now **live and authenticated** at https://gauntlet-review-harness.up.railway.app

## Decisions Made

- `origin` resolution priority in auth callback: `NEXT_PUBLIC_SITE_URL` > `x-forwarded-host` headers > `request.url` origin
- No `GITHUB_TOKEN` static PAT needed in prod — replaced by GitHub OAuth flow

## Production Env Variables (Railway)

All required vars are set. Key ones added this session:

- `NEXT_PUBLIC_SITE_URL=https://gauntlet-review-harness.up.railway.app`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (prod OAuth App)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (remote Supabase project `diecadjyrngrlveumsqn`)
- `ALLOWED_GITHUB_USERS=atharrison`

## Open Questions

- ATH-28: Where exactly does diff truncation happen in the review pipeline? Likely in `context-agent.ts` or wherever the diff is injected into the prompt.

## Next Steps

- Smoke-test a real PR review end-to-end in production
- Triage remaining backlog tickets for next sprint
- Investigate ATH-28 (diff truncation bug)

## Key Files

- `app/api/auth/callback/route.ts` — origin resolution fix (x-forwarded-\* headers)
- `.env.example` — now documents `NEXT_PUBLIC_SITE_URL`
- `tests/api.queue.test.ts` — GET /api/queue/repos `beforeEach` baseline fix
