-- Rename schema: move all app tables from public → agamotto
--
-- ALTER TABLE ... SET SCHEMA preserves: indexes, triggers, RLS policies, FK constraints.
-- It does NOT transfer grants — those must be re-applied on the new schema-qualified names.
-- Function OID references in triggers survive the schema move for both functions and tables.
-- ============================================================
-- 1. Create the agamotto schema
-- ============================================================
create schema if not exists agamotto;

-- ============================================================
-- 2. Move helper functions
-- ============================================================
alter function public.set_updated_at ()
set schema agamotto;

alter function public.manage_tracked_pr_on_reviewed ()
set schema agamotto;

-- ============================================================
-- 3. Move tables (reviews before tracked_prs — FK dependency)
-- ============================================================
alter table public.memories
set schema agamotto;

alter table public.review_history
set schema agamotto;

alter table public.review_checkpoints
set schema agamotto;

alter table public.reviews
set schema agamotto;

alter table public.tracked_prs
set schema agamotto;

alter table public.configured_repos
set schema agamotto;

alter table public.settings
set schema agamotto;

-- ============================================================
-- 4. Re-grant privileges on the new schema-qualified names
-- (Grants on public.tablename are implicitly dropped when the
--  table leaves the public schema.)
-- ============================================================
-- reviews
grant all on agamotto.reviews to service_role;

grant
select
  on agamotto.reviews to authenticated;

-- tracked_prs
grant all on agamotto.tracked_prs to service_role;

grant
select
  on agamotto.tracked_prs to authenticated;

-- configured_repos: authenticated users do full admin CRUD
grant all on agamotto.configured_repos to service_role;

grant all on agamotto.configured_repos to authenticated;

-- settings: authenticated users do full admin CRUD
grant all on agamotto.settings to service_role;

grant all on agamotto.settings to authenticated;

-- memories
grant all on agamotto.memories to service_role;

grant
select
  on agamotto.memories to authenticated;

-- review_history
grant all on agamotto.review_history to service_role;

grant
select
  on agamotto.review_history to authenticated;

-- review_checkpoints
grant all on agamotto.review_checkpoints to service_role;

grant
select
  on agamotto.review_checkpoints to authenticated;

-- ============================================================
-- 5. Grant usage on the schema itself to the Supabase roles
-- ============================================================
grant usage on schema agamotto to authenticated;

grant usage on schema agamotto to service_role;

grant usage on schema agamotto to anon;
