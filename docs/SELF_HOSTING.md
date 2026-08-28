# Self-Hosting Agamotto

Deploy your own Agamotto instance from scratch in under 30 minutes.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Fork and install](#2-fork-and-install)
3. [Supabase setup](#3-supabase-setup)
4. [GitHub OAuth App](#4-github-oauth-app)
5. [Railway deployment](#5-railway-deployment)
6. [Configure repos in the app](#6-configure-repos-in-the-app)
7. [GitHub webhook setup](#7-github-webhook-setup-per-repo)
8. [Environment variable reference](#8-environment-variable-reference)
9. [Upgrade path](#upgrade-path-webhooks--github-app)

---

## 1. Prerequisites

Before you start, make sure you have:

| Requirement           | Notes                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| **Node.js 22+**       | The `.nvmrc` pins Node 24 — `nvm use` handles this automatically. Minimum is 22.     |
| **Supabase account**  | Free tier is enough. [supabase.com](https://supabase.com)                            |
| **Railway account**   | Free trial works. [railway.app](https://railway.app)                                 |
| **GitHub account**    | Used for OAuth login and PR access.                                                  |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) — needs Claude Sonnet access. |
| **Git**               | To clone the repo and trigger deployments.                                           |

Optional but recommended:

- **Linear API key** — enables ticket context in reviews. Reviews degrade gracefully without it.

---

## 2. Fork and install

**Fork the repo** on GitHub first — this is required so the GitHub Actions migration workflow runs under your own account and secrets.

1. Go to [github.com/atharrison/agamotto](https://github.com/atharrison/agamotto) → **Fork**.
2. Clone your fork locally:

```bash
git clone https://github.com/<your-username>/agamotto.git
cd agamotto
nvm use          # picks up .nvmrc → Node 24
npm install
npm run env:init
```

Fill in `.env` as you complete the steps below. The app will refuse to start with a clear error listing any missing required variables.

> **Local-only use** (no Railway deployment): a plain `git clone` of the upstream repo is fine — you just won't have GitHub Actions for migrations. Use `npm run db:migrate` locally instead.

---

## 3. Supabase setup

### 3a. Create a new project — or connect an existing one

> **Schema isolation**: Agamotto creates and uses its own `agamotto` schema. No tables are written to `public`. This means it is safe to add Agamotto to an existing Supabase project without disturbing other services.

**New project:**

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Choose a region close to your Railway deployment region.
3. Save the **database password** — you'll need it for the GitHub Actions secret.

**Existing project:**

1. Open your project in the Supabase dashboard.
2. Note your **project ref** (the ID in the dashboard URL) and **database password** — you'll need both for the migration step below.

### 3b. Enable the GitHub OAuth provider

1. In your Supabase project, go to **Authentication → Providers → GitHub**.
2. Toggle it **enabled**.
3. Copy the **Callback URL** shown — you'll need it when creating your GitHub OAuth App in step 4.
4. Leave the **Client ID** and **Client Secret** fields empty for now — you'll fill them in after step 4b.

### 3c. Copy your Supabase env vars

From **Settings → API** in your Supabase project:

| Variable                               | Where to find it                                          |
| -------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project URL (e.g. `https://xxxx.supabase.co`)             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `anon` / public key                                       |
| `SUPABASE_SERVICE_ROLE_KEY`            | `service_role` key — keep secret                          |
| `SUPABASE_PROJECT_REF`                 | The ID in your dashboard URL (for CLI and GitHub Actions) |

### 3d. Set up GitHub Actions secrets

In your fork on GitHub, go to **Settings → Secrets and variables → Actions** and add:

| Secret name             | Value                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | From [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_REF`  | Your project ref                                                                            |
| `SUPABASE_DB_PASSWORD`  | The database password you saved at project creation                                         |

### 3e. Apply the database migration

Agamotto uses a dedicated `agamotto` schema (not `public`). Migrations are applied automatically by GitHub Actions on any push to `main` that touches `supabase/migrations/`.

**For a fresh fork**, the migration files are already committed — a normal push won't retrigger the workflow. Trigger it manually once now that your secrets are in place:

1. In your fork on GitHub, go to **Actions → Supabase Deploy**.
2. Click **Run workflow → Run workflow**.

No local CLI setup needed. Future migrations (when you pull updates from upstream) will apply automatically on merge to `main`.

---

## 4. GitHub OAuth App

### 4a. Create the OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** (or use [this link](https://github.com/settings/applications/new)).
2. Fill in:

   | Field                          | Value                                                                 |
   | ------------------------------ | --------------------------------------------------------------------- |
   | **Application name**           | `Agamotto` (or whatever you like)                                     |
   | **Homepage URL**               | Your Railway app URL — use a placeholder for now; update after step 5 |
   | **Authorization callback URL** | `https://<your-domain>/api/auth/callback`                             |

3. Click **Register application**.

### 4b. Copy the credentials

- **Client ID** → `GITHUB_CLIENT_ID`
- Click **Generate a new client secret** → `GITHUB_CLIENT_SECRET`

> **Scopes**: Agamotto uses GitHub OAuth for authentication only. Read access to PR diffs comes from the authenticated user's token, which already has `repo` access on sign-in. No additional scopes need to be set on the OAuth App itself.

### 4c. Complete the Supabase GitHub provider

Go back to the Supabase GitHub provider page you opened in step 3b. Paste in the **Client ID** and **Client Secret**, then click **Save**.

---

## 5. Railway deployment

### 5a. Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. If prompted, authorize Railway to access your GitHub account. If Railway is already connected but your fork doesn't appear in the list, click **Configure** next to your GitHub account → find the agamotto fork under **Repository access** → grant access → save.
3. Select your fork of `agamotto`.
4. Railway will auto-detect it as a Next.js app.

### 5b. Set environment variables

In your Railway service → **Variables**, add all required variables. The fastest path is to copy your `.env` file contents and paste them in bulk using Railway's **Raw Editor**.

**Required variables** (the app will not start without these):

```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Required for production**:

```
NEXT_PUBLIC_SITE_URL=https://<your-railway-domain>
```

> This overrides Railway's internal bind address (`0.0.0.0:8080`) so OAuth redirects and SSE streams resolve correctly.

**Recommended**:

```
OTEL_TRACES_EXPORTER=NONE
ALLOWED_GITHUB_USERS=alice,bob,carol   # comma-separated GitHub usernames
```

See the [full reference table](#8-environment-variable-reference) for all variables.

### 5c. Configure the health check

In your Railway service, go to **Settings → Health Check** and set the path to `/api/health`. Railway will poll this endpoint and mark the deployment healthy once it returns `200`.

### 5d. Verify the deployment

Once Railway shows the deployment as **Active**, open:

```
https://<your-railway-domain>/api/health
```

You should see:

```json
{ "status": "ok", "ts": "2026-08-27T..." }
```

Then open the app root and sign in with GitHub.

---

## 6. Configure repos in the app

1. Sign in to your Agamotto instance with GitHub.
2. Navigate to **Queue → Settings**.
3. Enter a repo in one of these formats:
   - `owner/repo` (e.g. `atharrison/agamotto`)
   - Full GitHub URL (e.g. `https://github.com/atharrison/agamotto`)
4. Click **Add**. The repo row is created in the database — PRs from it will appear in the queue when webhooks fire.

You can add as many repos as you like. To remove a repo, click the **Remove** button in the settings list.

---

## 7. GitHub webhook setup (per repo)

Webhooks let Agamotto receive push notifications when PRs are opened, updated, or closed — instead of relying on manual queue entry.

For each GitHub repo you want Agamotto to monitor:

### 7a. Generate and store the webhook secret

Each repo needs its own secret for GitHub to sign webhook payloads. Generate one:

```bash
npm run webhook:secret
```

Copy the output. Then:

1. In the Supabase dashboard, open **Table Editor → agamotto → configured_repos**.
2. Find the row for this repo and paste the secret into the `webhook_secret` column.
3. Save the row.

Keep the secret handy — you'll paste it into GitHub in the next step.

> <!-- TODO: update this section when webhook secret is auto-generated from the Queue → Settings page -->

### 7b. Create the webhook in GitHub

1. Go to the GitHub repo → **Settings → Webhooks → Add webhook**.
2. Fill in:

   | Field             | Value                                                                     |
   | ----------------- | ------------------------------------------------------------------------- |
   | **Payload URL**   | `https://<your-railway-domain>/api/webhooks/github`                       |
   | **Content type**  | `application/json`                                                        |
   | **Secret**        | Paste the webhook secret from step 7a                                     |
   | **Which events?** | Select **Let me select individual events** → check **Pull requests** only |

3. Click **Add webhook**. GitHub will send a ping event — a green checkmark confirms the endpoint is reachable.

---

## 8. Environment variable reference

### Required

| Variable                               | Description                                                       |
| -------------------------------------- | ----------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                    | Anthropic API key. Needs access to Claude Sonnet.                 |
| `GITHUB_CLIENT_ID`                     | GitHub OAuth App client ID.                                       |
| `GITHUB_CLIENT_SECRET`                 | GitHub OAuth App client secret.                                   |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL (`https://xxxx.supabase.co`).                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase `anon` key.                                              |
| `SUPABASE_SERVICE_ROLE_KEY`            | Supabase `service_role` key. Keep secret — grants full DB access. |

### Required in production

| Variable               | Description                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | Public base URL of your deployment. Overrides Railway's internal bind address for OAuth redirects and SSE. Example: `https://agamotto-production.up.railway.app` |

### Optional — authentication

| Variable               | Default                | Description                                                                                                                                       |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_GITHUB_USERS` | _(empty — allows all)_ | Comma-separated list of GitHub usernames allowed to sign in. Empty means all authenticated GitHub users are accepted. **Set this in production.** |
| `ACCESS_PASSWORDS`     | _(empty — disabled)_   | Comma-separated list of access codes for the anonymous homepage gate (bypasses GitHub OAuth). Leave unset unless you need non-GitHub access.      |

### Optional — LLM

| Variable       | Default             | Description                                            |
| -------------- | ------------------- | ------------------------------------------------------ |
| `LLM_PROVIDER` | `anthropic`         | LLM provider. Currently only `anthropic` is supported. |
| `LLM_MODEL`    | `claude-sonnet-4-6` | Model name to pass to the provider.                    |

### Optional — ticket tracker

| Variable          | Default   | Description                                                                               |
| ----------------- | --------- | ----------------------------------------------------------------------------------------- |
| `TICKET_PROVIDER` | `linear`  | Ticket tracker for fetching issue context.                                                |
| `LINEAR_API_KEY`  | _(empty)_ | Linear API key. Reviews degrade gracefully without it — ticket context is simply omitted. |

### Optional — memory

| Variable          | Default    | Description                                                        |
| ----------------- | ---------- | ------------------------------------------------------------------ |
| `MEMORY_PROVIDER` | `supabase` | `supabase` for web/team-shared memory. `sqlite` for local CLI use. |

### Optional — guardrails

| Variable       | Default   | Description                                                                                    |
| -------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `MAX_TURNS`    | `20`      | Max agent turns before `TURN_LIMIT_EXCEEDED` alarm fires.                                      |
| `MAX_TOKENS`   | `200000`  | Token budget across the pipeline.                                                              |
| `TIMEOUT_MS`   | `300000`  | Overall review timeout in milliseconds (5 minutes).                                            |
| `SCOPE_BUDGET` | `10`      | Max external context lookups (codebase search, past reviews) per run.                          |
| `PR_MAX_FILES` | `50`      | Warn above this many changed files.                                                            |
| `PR_MAX_LINES` | `3000`    | Warn above this many changed lines.                                                            |
| `DRY_RUN`      | `false`   | Set `true` to suppress all GitHub writes (posting comments, approving PRs). Safe for dev/demo. |
| `DEBUG_LLM`    | _(empty)_ | Set `true` to log raw LLM output on parse failures.                                            |

### Optional — observability

| Variable                      | Default     | Description                                                                      |
| ----------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `OTEL_TRACES_EXPORTER`        | _(console)_ | Set `NONE` to disable tracing. Recommended for local dev to avoid console noise. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(empty)_   | OTLP endpoint for shipping traces to Honeycomb, SigNoz, Datadog, etc.            |

### GitHub Actions secrets (for automatic migration deploys)

| Secret                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Personal access token from Supabase dashboard. |
| `SUPABASE_PROJECT_REF`  | Supabase project ref (from dashboard URL).     |
| `SUPABASE_DB_PASSWORD`  | Database password set at project creation.     |

---

## Upgrade path: webhooks → GitHub App

The current webhook setup (step 6) uses **per-repo secrets** — you configure a webhook on each repository individually. This works well for a handful of repos.

When you outgrow it, the natural upgrade is a **GitHub App**:

- One installation covers all repos in an org or user account.
- Events use a single App-level secret (no per-repo secret management).
- Supports fine-grained permissions and can act as a bot identity.

This upgrade path is tracked as a future milestone. The webhook receiver at `/api/webhooks/github` is designed to be compatible with either approach — the HMAC verification logic is the same.
