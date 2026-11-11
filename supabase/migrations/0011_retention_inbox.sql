-- Privacy Desk: retention reaches the inbox.
--
-- Two faults, found in review:
--
-- 1. pd.apply_retention never touched pd.inbox_items, so the full text of a requester's
--    message stayed in the inbox for good: declined items for ever, accepted ones after the
--    case they became had been deleted.
-- 2. Worse, retention could not delete a case that came from the inbox at all. The item's
--    case_id was "on delete set null", but an accepted item must have a case (a check
--    constraint), so the delete failed and took the whole retention run with it.
--
-- Now an inbox item goes with its case, and declined items go once they are older than the
-- client's retention period, counted from the day they were declined. Items still waiting
-- for a person ("new") are never removed by the job.

alter table pd.inbox_items drop constraint inbox_items_case_id_fkey;
alter table pd.inbox_items
  add constraint inbox_items_case_id_fkey foreign key (case_id) references pd.cases (id) on delete cascade;
-- The foreign key had no index; retention and the cascade both look items up by case.
create index inbox_items_case on pd.inbox_items (case_id) where case_id is not null;

create or replace function pd.apply_retention() returns int
language plpgsql security definer set search_path = pd, pg_temp as $$
declare n int; m int; k int;
begin
  -- Closed cases past the client's period, with their pauses, events and inbox items.
  delete from pd.cases c using pd.organisations o
  where o.id = c.organisation_id and c.status = 'closed'
    and c.closed_on < current_date - make_interval(months => o.retention_months);
  get diagnostics n = row_count;

  -- Declined inbox items past the same period.
  delete from pd.inbox_items i using pd.organisations o
  where o.id = i.organisation_id and i.status = 'declined'
    and i.decided_at < now() - make_interval(months => o.retention_months);
  get diagnostics k = row_count;

  -- Form submissions: unverified ones a week after the link expired, verified ones after
  -- 90 days (the inbox item or case holds the request by then).
  delete from pd.form_submissions
  where (verified_at is null and expires_at < now() - interval '7 days')
     or (verified_at is not null and verified_at < now() - interval '90 days');
  get diagnostics m = row_count;
  return n + k + m;
end $$;
