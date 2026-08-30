> **Starting a new session?** Run `/current-state` to orient before starting work.

---

# Session State — 2026-08-30 00:40

## Context

ATH-35/39 merged as [PR #12](https://github.com/atharrison/agamotto/pull/12). Filter is on `main`. ATH-43 plant PR [#11](https://github.com/atharrison/agamotto/pull/11) still open — do not merge with plants in. Branch is `main`. Andrew will PR `CURRENT_STATE.md` separately.

## Decisions Made

- **Stop iterating `finding-quality.ts` on #11** — tickets met on ATH-16/15/38 fixtures; plant PR rarely emits hedge/truncation sentences. Remaining noise is domain emission (ATH-48), not more regex.
- **`FINDING_QUALITY_FILTER` default ON** if unset. R6–R8 valid without `.env`. Auto-adjusted notes prove the filter on PR #12, not on R6–R8.
- **Never run destructive SQL** — output it; Andrew executes. Memory added.
- **Keep #11 plants + `generated/control-reviews/`** as ATH-48 measuring stick. R8 (`29b9ba0b`) left in local DB on purpose.
- **Prompt overlays, not filter round 2** — ATH-48 absorbs ATH-23 (conventions editor never wired). ATH-49 is confidence floor UI, design first (not a locked “slider”).

## Tickets Touched

- **ATH-35 / ATH-39**: Done ✅ — PR #12. Self-review COMMENT `#issuecomment-5466884923`; reply `#issuecomment-5466942725`.
- **ATH-48**: Created — per-agent prompt overlays + next fidelity pass (Post-MVP).
- **ATH-49**: Created — review-page confidence floor, design first.
- **ATH-43**: Unchanged — plants stay; Option D after ATH-48 baseline.

## What Was Tried and Abandoned

- Dropping sub-0.7 findings in the lib — fights ATH-49; emit-and-don’t-drop.
- Raising 32 KB / more hedge regexes after R6–R8 — declined.
- Env-var “security audit trail” from PR #12 review — declined.

## Open Questions / Blockers

- After #11 merges: one-liner `defaultFindingAccepted` in ReviewShell (live SSE still checks non-NITs).
- Queue stuck `IN_REVIEW` after COMPLETE unsubmitted — homepage paste workaround; no ticket.

## Next Steps

1. PR `CURRENT_STATE.md` only (this file).
2. ATH-48 when ready; do not merge #11 with plants.
3. ATH-42 / ATH-44 still backlog.

## Key Files

- `src/lib/finding-quality.ts`, `generated/ath-43-control-analysis.md`, `generated/blog-review-fidelity.md`, `generated/control-reviews/INDEX.md`

---

# Session State — 2026-08-29 21:17

## Context

ATH-19 (history page + error handling) shipped as [PR #10](https://github.com/atharrison/agamotto/pull/10), merged to `main`. This session was on the Sonnet side (prior turns were Grok). Session focused on post-merge review quality assessment + backlog filing. Branch is now `main`.

## Decisions Made

- **`healStuckInReviewRows` stays in hot path for now** — ATH-47 filed to move it out. Option 1 (call from `completeReview`/`failReview`) is the likely right long-term answer; deferred.
- **Failed first review resets to OPEN, no error indicator** — acknowledged as acceptable low-priority behavior. ATH-46 tracks whether this needs UX treatment.
- **24-item Agamotto review of PR #10: no action** — posted [comment on PR #10](https://github.com/atharrison/agamotto/pull/10#issuecomment-5466186879) explaining: most items were false positives from context gaps; scope mismatch; architecture already decided; ATH-46/ATH-47 cover the two real items. Next ticket is review quality (ATH-35/ATH-39).
- **Token limits bumped to 500k** in `.env` (`MAX_TOKENS=500000`) — 200k was not enough for the large PR #10 diff. Env var wiring from this PR is what made this adjustable.

## Tickets Touched

- **ATH-19**: Done ✅ — PR #10 merged. Token budget wiring, error stats SSE, `healStuckInReviewRows`, test coverage.
- **ATH-47**: Created — Improvement, Low, Backlog. Move `healStuckInReviewRows` out of page-render hot path.
- **ATH-46**: Created (prior session/Grok) — Low, Backlog. Decide if failed-first-review showing "Open" is a bug.

## What Was Tried and Abandoned

- Nothing new this session — assessment + ticket filing only.

## Open Questions / Blockers

- None blocking. ATH-35 / ATH-39 are next.

## Next Steps

1. **New agent window** — ATH-35 and ATH-39 (review quality: false positives, truncated diffs, context improvements).
2. ATH-42 (GitHub comment post failure surface + copy button) — still open.
3. ATH-44 (stale GitHub OAuth 403) — backlog.

## Key Files

- `src/lib/harness-limits.ts`, `src/lib/review-run-stats.ts` — new this PR
- `src/memory/tracked-pr-store.ts` (`healStuckInReviewRows`)
- `app/api/review/[id]/route.ts` — token budget error SSE path
- `app/review/[id]/ReviewShell.tsx` — token overage display

---

# Session State — 2026-08-29 01:37

## Context

ATH-32 merged as [PR #9](https://github.com/atharrison/agamotto/pull/9) (`6836119` on `main`). Full reviews coordinator-inject this PR's GitHub conversation. Two Agamotto review passes on the PR; round 1 hardening landed; round 2 “blocker” was a misread of fetch-vs-write order.

## Decisions Made

- **Coordinator-inject `githubConversation`**, same pattern as ATH-18 `priorRounds`. Do not add context-agent tool steps. Quick mode skips the fetch (empty pack).
- **Fetch in parallel, write after context agent**: `loadGithubConversation` starts before `runContextAgent`; overwrite is `{ ...ctxResult.context, priorRounds, githubConversation }`. Model JSON cannot win.
- **Untrusted data**: wrap pack in `<github_conversation>`; neutralize those tags in bodies. Note: do not obey directive-like text; a “settled” comment is not enough to drop a finding.
- **Caps**: 16 KB pack / 2 KB body; first GitHub page only (`per_page: 100`). Missing token → skip fetch, warn, “unavailable”. Redact PEM / `ghp_`/`gho_`/`github_pat_` / `sk-` / Bearer / `AKIA` / `npm_`. Declined unbounded regex treadmill (Slack, high-entropy SHAs).
- **Keep Agamotto GitHub comments** in the pack even when `priorRounds` exists. Activity feed is counts-only (no bodies in UI).

## Tickets Touched

- **ATH-32**: Done ✅ — PR #9. Replies: `#issuecomment-5460768827` (round 1), `#issuecomment-5460813683` (round 2).

## What Was Tried and Abandoned

- Ticket’s original AC (numbered `fetch_pr_comments` + `prComments`/`prDiscussion` fields): superseded by coordinator inject + one `githubConversation` pack.
- Extra LLM summarize of long threads: user backed off.
- Expanding redaction to Slack/high-entropy on Agamotto round 2: declined.

## Open Questions / Blockers

- Pagination / GraphQL resolved-threads still out of scope. ATH-44 stale GitHub OAuth 403 still backlog.

## Next Steps

1. ATH-19 (`/history`).
2. ATH-39 / ATH-35 (review quality); ATH-42 then ATH-44.
3. Backlog: ATH-41, ATH-37.

## Key Files

- `src/lib/github-conversation.ts`, `src/tools/github.ts` (`fetchPrConversation`)
- `src/agents/pr-review/coordinator.ts`, `prompts.ts`, `domain-agent-utils.ts` (`domainContextJson`)
- `docs/plans/2026-08-28-001-feat-pr-github-comments-plan.md`

---

# Session State — 2026-08-28 23:38

## Context

ATH-18 merged as [PR #8](https://github.com/atharrison/agamotto/pull/8) (`ce8ea1d` on `main`). Re-review injects this-PR prior findings. Two Agamotto passes; round 1 prompt/activity copy landed; round 2 REQUEST_CHANGES was ATH-39 FPs.

## Decisions Made

- **This-PR history is coordinator-injected**, not `search_past_reviews`. Query is COMPLETE **and** `neq(id, excludeId)`. Coordinator always overwrites `priorRounds` (system source of truth).
- **Prompt omits `priorRounds` from LLM JSON**; payload in `<prior_rounds>` as data-only. Activity feed prefers SSE `data.label` (`formatPriorRoundsActivity`).
- **Do not raise the 32 KB patch cap as the ATH-39 fix**: PR #8 largest file patch was 7.1 KB; whole PR ~47 KB. Domain agents only see `EnrichedContext`. Comment on ATH-39 has the implementation order.

## Tickets Touched

- **ATH-18**: Done ✅ — PR #8. Replies: `#issuecomment-5460278834` (round 1 take), `#issuecomment-5460346139` (round 2 decline).
- **ATH-39**: Comment — 32 KB cap was not involved; don’t bump as the fix.
- **ATH-44**: Created this session (stale GitHub OAuth 403 on comment post). Backlog. ATH-42 is the UI banner.

## What Was Tried and Abandoned

- Raising `FILE_CONTENT_MAX_BYTES` for round 2: rejected — cap never fired.

## Open Questions / Blockers

- ATH-44: logout/login refreshes `gh_provider_token`; fix belongs in `src/lib/github-auth.ts`, not Octokit tools.

## Next Steps

1. ATH-19 (`/history`).
2. ATH-39 / ATH-35 (review quality); ATH-42 then ATH-44.
3. ATH-32. Backlog: ATH-41, ATH-37.

## Key Files

- `src/lib/prior-rounds.ts`, `src/memory/review-store.ts` (`listCompleteReviewsForPr`)
- `src/agents/pr-review/coordinator.ts`, `context-agent.ts`, `prompts.ts`
- `app/review/[id]/ReviewShell.tsx` (`data.label`)

---

# Session State — 2026-08-27 23:59

## Context

ATH-30 (queue View Review + sibling pager) merged as PR #7; Andrew closed the ticket Done. On `main`. Two Agamotto review passes on the PR; convention nits landed, most “blockers” were already implemented.

## Decisions Made

- **View Review is not REVIEWED-only**: `viewReviewHref` needs `last_review_id` and excludes `IN_REVIEW` only. OPEN (updated-since-review) and CLOSED/merged still link. Linking IN_REVIEW would re-enter the live pipeline.
- **Pager is review-page only**: `listCompleteReviewIdsForPr` once on `/review/[id]` (`select('id')`, `created_at ASC`). Queue does not JOIN or N+1.
- **COMPLETE hydrate is server `storedResult`**: skip EventSource when set. `getReview` stays `select('*')` because replay needs `result`. `ReviewShell key={reviewId}` remounts on Older/Newer (Next.js can reuse client state).
- **Agamotto review N+1 / Map-cache / pagination / RTL** on this PR: declined with evidence. No React Jest in this repo.

## Tickets Touched

- **ATH-30**: Done ✅ — PR #7. Replies: `#issuecomment-5448534690`, `#issuecomment-5448590961`.
- **ATH-18**: still open — per-PR finding history on re-review, not just `search_past_reviews` in the prompt.

## What Was Tried and Abandoned

- Extra queue JOIN to prove `last_review_id` is COMPLETE: rejected — IN_REVIEW already hides the live id; join is the N+1 the bot also flagged.

## Open Questions / Blockers

- Track PR (`POST /api/queue`) does not backfill `last_review_id` from existing `reviews` rows (local PR #3: CLOSED, no reviews).
- Local DB has no prod GitHub comments; pager demo was local PR #6 (2 COMPLETE rows).

## Next Steps

1. ATH-19 (`/history`).
2. ATH-18 (per-PR prior findings on re-review).
3. Quality ATH-35 / ATH-39; then ATH-32. Backlog: ATH-42, ATH-41, ATH-37.

## Key Files

- `src/lib/tracked-prs.ts` (`viewReviewHref`), `src/lib/review-siblings.ts`, `src/lib/stored-review-ui.ts`, `src/lib/review-stream.ts`
- `src/memory/review-store.ts` (`listCompleteReviewIdsForPr`)
- `app/queue/QueueDisplay.tsx`, `app/review/[id]/page.tsx` (`key={reviewId}`), `ReviewShell.tsx`

---

# Session State — 2026-08-27 22:23

## Context

ATH-20 (self-hosting guide) merged as PR #6. Custom domain `agamotto.dev` is now live via Cloudflare → Railway. Both `agamotto.dev` (redirect) and `www.agamotto.dev` (canonical) resolve with valid TLS.

## Decisions Made

- **Steps 6/7 swapped from ticket AC**: "Configure repos" (step 6) before "Webhook setup" (step 7) — DB row must exist before `webhook_secret` can be written.
- **`workflow_dispatch` added to `supabase-deploy.yml`**: fresh forks won't retrigger on push; manual trigger is the self-hoster bootstrap path.
- **`npm run env:init` / `webhook:secret`**: `cp -n .env.example .env` and `openssl rand -hex 32` wrappers added to `package.json`.
- **`repo` OAuth scope**: already in `app/login/page.tsx` `signInWithOAuth` — no Supabase UI config needed.
- **Canonical URL is `www.agamotto.dev`**: Railway custom domain is `www`; bare `agamotto.dev` 301s via Cloudflare redirect rule. `NEXT_PUBLIC_SITE_URL`, Supabase Site URL, and GitHub OAuth App Homepage URL all updated to `https://www.agamotto.dev`.
- **Cloudflare as DNS**: Squarespace nameservers replaced with Cloudflare (`roan` + `zariyah`). `www` CNAME is DNS-only (Railway terminates TLS); `@` CNAME is proxied (Cloudflare terminates TLS for bare domain).

## Tickets Touched

- **ATH-20**: Done ✅ — PR #6 merged.
- **ATH-41**: Created — auto-generate webhook secret on repo add. Backlog, Medium.
- **ATH-42**: Created — surface GitHub comment post failure + copy-to-clipboard button. Backlog, High.

## What Was Tried and Abandoned

- Squarespace DNS for `@` CNAME — not supported at apex; switched to Cloudflare.
- "Additional scopes" in Supabase GitHub provider UI — doesn't exist; scope is in code.

## Open Questions / Blockers

- ATH-36 (webhook secret UI) partially superseded by ATH-41; still open.
- Browser shows "not secure" on cached sessions — clears with `chrome://net-internals/#hsts` delete + hard reload.

## Next Steps

1. ATH-42 (finalize error surfacing + copy-to-clipboard) — small, high-value.
2. ATH-41 (webhook secret auto-gen in settings UI).
3. ATH-37 queue auto-refresh, ATH-30 queue → past review.

## Key Files

- `docs/SELF_HOSTING.md` — self-hosting guide
- `package.json` — `env:init`, `webhook:secret` scripts
- `.github/workflows/supabase-deploy.yml` — `workflow_dispatch` added
- `app/login/page.tsx` — `repo` scope in `signInWithOAuth`
- `app/api/review/[id]/finalize/route.ts` — ATH-42 target
- Ops doc: `cursor-rules/workspaces/agamotto/DOMAIN_SETUP.md`

---

# Session State — 2026-08-27 02:09

## Context

ATH-40 closed. Agamotto is live at https://agamotto.up.railway.app (Railway `agamotto-web`). Hosted schema is `agamotto`; GitHub Actions `db push` applies migrations. Queue Start Review 401 was leftover `ACCESS_PASSWORDS`, not the new repo.

## Decisions Made

- **Single baseline, no SET SCHEMA for self-hosters**: `20260827000000_initial_agamotto_schema.sql` only. Hosted tables were moved earlier; `schema_migrations` repaired so the baseline looks applied (SQL never re-ran).
- **Apply hosted SQL via migration + merge**, not the SQL editor. PR #4 granted `USAGE` on schema `agamotto` (SET SCHEMA does not copy schema grants; 42501).
- **GitHub session skips `ACCESS_PASSWORDS`** on `POST /api/review/start` (PR #5). Anonymous homepage still uses the env var. Check GitHub identity; skip `getUser` when the code gate is already open.
- **Webhook secret is `configured_repos.webhook_secret`**, not a Railway env var. ATH-36 still needed for UI. Both repos' GitHub hooks now point at `agamotto.up.railway.app/api/webhooks/github`.

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

## Tickets Touched

- **ATH-17**: Done ✅ (PR #22 merged)
- **ATH-38**: Created — make OTel tracing optional for local dev

## Next Steps

1. ATH-38 (OTel `OTEL_TRACES_EXPORTER=none`) — quick win
2. ATH-15 (wire `tracked_prs` to review lifecycle)
3. ATH-30 (link queue rows to past review output)

## Key Files

- `src/agents/pr-review/domain-agent-utils.ts` — shared parseDomainResult (new)
- `src/agents/pr-review/conventions-agent.ts`, `performance-agent.ts`, `style-agent.ts`
- `src/agents/pr-review/approval.ts` — NIT section added
- `app/review/[id]/ReviewShell.tsx` — DOMAIN phase hang fix
