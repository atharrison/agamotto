# Self-Hosting Agamotto

Deploy your own Agamotto instance from scratch in under 30 minutes.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and install](#2-clone-and-install)
3. [Supabase setup](#3-supabase-setup)
4. [GitHub OAuth App](#4-github-oauth-app)
5. [Railway deployment](#5-railway-deployment)
6. [GitHub webhook setup](#6-github-webhook-setup-per-repo)
7. [Configure repos in the app](#7-configure-repos-in-the-app)
8. [Environment variable reference](#8-environment-variable-reference)
9. [Upgrade path](#upgrade-path-webhooks--github-app)

---

## 1. Prerequisites

Before you start, make sure you have:

| Requirement           | Notes                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| **Node.js 22+**       | `node --version` should show `v22.x` or later. Use `nvm` if needed.                  |
| **Supabase account**  | Free tier is enough. [supabase.com](https://supabase.com)                            |
| **Railway account**   | Free trial works. [railway.app](https://railway.app)                                 |
| **GitHub account**    | Used for OAuth login and PR access.                                                  |
| **Anthropic API key** | [console.anthropic.com](https://console.anthropic.com) — needs Claude Sonnet access. |
| **Git**               | To clone the repo and trigger deployments.                                           |

Optional but recommended:

- **Linear API key** — enables ticket context in reviews. Reviews degrade gracefully without it.

---

## 2. Clone and install

```bash
git clone https://github.com/atharrison/agamotto.git
cd agamotto
nvm use          # picks up .nvmrc → Node 24
npm install
npm run env:init
```

Fill in `.env` as you complete the steps below. The app will refuse to start with a clear error listing any missing required variables.

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
2. Confirm the `vector` extension is enabled: **Database → Extensions → pgvector** (Agamotto's migration enables it automatically if it isn't, but your Supabase plan must support it — all paid plans and the free tier do).
3. Note your **project ref** (the ID in the dashboard URL) and **database password** — you'll need both for the migration step below.

### 3b. Enable the GitHub OAuth provider

1. In your Supabase project, go to **Authentication → Providers → GitHub**.
2. Toggle it **enabled**.
3. Paste in your GitHub OAuth App **Client ID** and **Client Secret** (created in step 4).
4. Copy the **Callback URL** shown — you'll paste it into your GitHub OAuth App.

### 3c. Apply the database migration

Agamotto uses a dedicated `agamotto` schema (not `public`). Migrations live in `supabase/migrations/` and are automatically applied on push to `main` via GitHub Actions.

**For a fresh install**, apply them manually once. The Supabase CLI is already in `devDependencies` — use `npm run` scripts or `npx supabase` directly (no separate install needed):

```bash
# Link to your hosted project (project ref is in your Supabase dashboard URL:
# https://supabase.com/dashboard/project/<PROJECT_REF>)
npx supabase link --project-ref <YOUR_PROJECT_REF>

# Push all migrations
npm run db:migrate
```

Alternatively, paste the contents of `supabase/migrations/20260827000000_initial_agamotto_schema.sql` and `supabase/migrations/20260827010000_grant_agamotto_schema_privileges.sql` directly into the **SQL editor** in the Supabase dashboard (run them in order).

### 3d. Copy your Supabase env vars

From **Settings → API** in your Supabase project:

| Variable                               | Where to find it                                          |
| -------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project URL (e.g. `https://xxxx.supabase.co`)             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `anon` / public key                                       |
| `SUPABASE_SERVICE_ROLE_KEY`            | `service_role` key — keep secret                          |
| `SUPABASE_PROJECT_REF`                 | The ID in your dashboard URL (for CLI and GitHub Actions) |

### 3e. Set up GitHub Actions secrets (for automatic migration deploys)

In your fork on GitHub, go to **Settings → Secrets and variables → Actions** and add:

| Secret name             | Value                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | From [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_REF`  | Your project ref                                                                            |
| `SUPABASE_DB_PASSWORD`  | The database password you saved at project creation                                         |

After this, any push to `main` that touches `supabase/migrations/` will automatically apply new migrations.

---

## 4. GitHub OAuth App

### 4a. Create the OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** (or use [this link](https://github.com/settings/applications/new)).
2. Fill in:

   | Field                          | Value                                                                    |
   | ------------------------------ | ------------------------------------------------------------------------ |
   | **Application name**           | `Agamotto` (or whatever you like)                                        |
   | **Homepage URL**               | Your Railway app URL (e.g. `https://agamotto-production.up.railway.app`) |
   | **Authorization callback URL** | `https://<your-domain>/api/auth/callback`                                |

3. Click **Register application**.

### 4b. Copy the credentials

- **Client ID** → `GITHUB_CLIENT_ID`
- Click **Generate a new client secret** → `GITHUB_CLIENT_SECRET`

> **Scopes**: Agamotto uses GitHub OAuth for authentication only. Read access to PR diffs comes from the authenticated user's token, which already has `repo` access on sign-in. No additional scopes need to be set on the OAuth App itself.

### 4c. Update your Supabase GitHub provider

Paste the **Client ID** and **Client Secret** into the Supabase GitHub provider settings you opened in step 3b.

---

## 5. Railway deployment

### 5a. Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Select your fork of `atharrison/agamotto`.
3. Railway will auto-detect it as a Next.js app.

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
ALLOWED_GITHUB_USERS=yourgithubusername
```

See the [full reference table](#8-environment-variable-reference) for all variables.

### 5c. Configure the health check

Railway automatically uses `/api/health` for health checks. No additional configuration needed.

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

## 6. GitHub webhook setup (per repo)

Webhooks let Agamotto receive push notifications when PRs are opened, updated, or closed — instead of relying on manual queue entry.

For each GitHub repo you want Agamotto to monitor:

### 6a. Get the webhook secret

The webhook secret is stored per-repo in the `configured_repos` table (set when you add the repo in step 7). After adding the repo:

1. In your Agamotto app, go to **Queue → Settings**.
2. Find the repo row — the webhook secret is displayed there.
3. Copy it.

### 6b. Create the webhook in GitHub

1. Go to the GitHub repo → **Settings → Webhooks → Add webhook**.
2. Fill in:

   | Field             | Value                                                                     |
   | ----------------- | ------------------------------------------------------------------------- |
   | **Payload URL**   | `https://<your-railway-domain>/api/webhooks/github`                       |
   | **Content type**  | `application/json`                                                        |
   | **Secret**        | Paste the webhook secret from step 6a                                     |
   | **Which events?** | Select **Let me select individual events** → check **Pull requests** only |

3. Click **Add webhook**. GitHub will send a ping event — a green checkmark confirms the endpoint is reachable.

---

## 7. Configure repos in the app

1. Sign in to your Agamotto instance with GitHub.
2. Navigate to **Queue → Settings**.
3. Enter a repo in one of these formats:
   - `owner/repo` (e.g. `atharrison/agamotto`)
   - Full GitHub URL (e.g. `https://github.com/atharrison/agamotto`)
4. Click **Add**. The repo is now tracked — PRs from it will appear in the queue when webhooks fire.

You can add as many repos as you like. To remove a repo, click the **Remove** button in the settings list.

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
