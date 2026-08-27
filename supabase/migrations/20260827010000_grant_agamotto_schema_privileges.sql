-- Hosted prod moved tables into agamotto via ALTER TABLE ... SET SCHEMA, then
-- marked 20260827000000 as applied without running it. SET SCHEMA does not
-- transfer grants, so authenticated lacked USAGE on schema agamotto
-- (Postgres 42501: "permission denied for schema agamotto").
-- GRANT is idempotent — safe on a fresh install that already ran the baseline.

grant usage on schema agamotto to authenticated;
grant usage on schema agamotto to service_role;
grant usage on schema agamotto to anon;

grant all on agamotto.reviews to service_role;
grant select on agamotto.reviews to authenticated;

grant all on agamotto.tracked_prs to service_role;
grant select on agamotto.tracked_prs to authenticated;

grant all on agamotto.configured_repos to service_role;
grant all on agamotto.configured_repos to authenticated;

grant all on agamotto.settings to service_role;
grant all on agamotto.settings to authenticated;

grant all on agamotto.memories to service_role;
grant select on agamotto.memories to authenticated;

grant all on agamotto.review_history to service_role;
grant select on agamotto.review_history to authenticated;

grant all on agamotto.review_checkpoints to service_role;
grant select on agamotto.review_checkpoints to authenticated;
