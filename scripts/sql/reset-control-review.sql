-- Reset one control review so PR #11 can be reviewed again from a clean slate.
--
-- Why this matters: ATH-18 injects prior rounds from any COMPLETE `reviews` row
-- with the same pr_url. A leftover row silently turns the next "clean" lap into
-- a re-review, which invalidates the control without any visible error.
--
-- Set the id once at the top; every statement below reads the variable.
--
-- Note: `reviews.id` and `review_checkpoints.review_id` are `text` columns, not
-- `uuid`. The value is a UUID string but the column is not, so the variable is
-- declared `text` to avoid casting at every use.
do $$
declare
  v_review_id   text := 'd6e5dd43-bbe8-4dbc-8555-1b3068c19138';
  v_pr_url      text := 'https://github.com/atharrison/agamotto/pull/11';
  v_checkpoints integer;
  v_tracked     integer;
  v_reviews     integer;
begin
  -- review_checkpoints has no foreign key to reviews, so nothing cascades here.
  delete from agamotto.review_checkpoints
   where review_id = v_review_id;
  get diagnostics v_checkpoints = row_count;

  -- tracked_prs.last_review_id is ON DELETE SET NULL, so the FK would clear
  -- that column on its own. `status` is not reset by the FK, and the queue will
  -- not offer Start Review while the row is stuck on IN_REVIEW.
  update agamotto.tracked_prs
     set status         = 'OPEN',
         last_review_id = null
   where pr_url         = v_pr_url
     and last_review_id = v_review_id;
  get diagnostics v_tracked = row_count;

  delete from agamotto.reviews
   where id = v_review_id;
  get diagnostics v_reviews = row_count;

  raise notice 'checkpoints deleted: % · tracked_prs reset: % · reviews deleted: %',
    v_checkpoints, v_tracked, v_reviews;

  -- A silent no-op is the dangerous outcome: the next lap looks clean but is
  -- not, so say so loudly rather than leaving it to be noticed in the scores.
  if v_reviews = 0 then
    raise warning 'No reviews row matched %. The next lap will NOT be clean.', v_review_id;
  end if;
end
$$;
