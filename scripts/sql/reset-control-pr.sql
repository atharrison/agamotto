-- Clear every review for one PR. Nothing to edit between laps.
--
-- Prefer this over reset-control-review.sql when running consecutive clean
-- control laps: there is no review id to copy, and it cannot leave a stray
-- COMPLETE row behind for ATH-18 to pick up as prior rounds.
--
-- Destructive by design — it removes the whole review history for this PR,
-- including the dumps' source rows. Export anything worth keeping first
-- (generated/control-reviews/) before running it.
do $$
declare
  v_pr_url      text := 'https://github.com/atharrison/agamotto/pull/11';
  v_checkpoints integer;
  v_tracked     integer;
  v_reviews     integer;
begin
  -- Must run first: it resolves review ids from the rows deleted below.
  delete from agamotto.review_checkpoints
   where review_id in (
     select id from agamotto.reviews where pr_url = v_pr_url
   );
  get diagnostics v_checkpoints = row_count;

  update agamotto.tracked_prs
     set status         = 'OPEN',
         last_review_id = null
   where pr_url = v_pr_url;
  get diagnostics v_tracked = row_count;

  delete from agamotto.reviews
   where pr_url = v_pr_url;
  get diagnostics v_reviews = row_count;

  raise notice 'checkpoints deleted: % · tracked_prs reset: % · reviews deleted: %',
    v_checkpoints, v_tracked, v_reviews;
end
$$;
