-- Privacy Desk: reminders that survive a failed send or a missed night.
--
-- Three faults, found in review:
--
-- 1. pd.reminders_due picked cases at exactly 7, 2 or 0 days left. If the job did not run
--    on that one night, the reminder was never sent.
-- 2. The log was written per case whether or not the email went, so a failed send was
--    recorded as done and never retried.
-- 3. Nothing was sent once a deadline had passed.
--
-- Now each reminder is a stage the case has reached: within 7 days, within 2 days, due
-- today, overdue. A stage is owed to each person until the log says that person was sent it
-- for that due date, so a missed night or a failed send is made up on the next run, and a
-- deadline that moves (an extension, a stopped clock) is reminded afresh. Overdue cases are
-- included every night until they are closed. The app logs a row only after the email went.

-- The stage a case is at. -1 means overdue.
create function pd.reminder_bucket(p_days_left int) returns int
language sql immutable as $$
  select case
    when p_days_left is null or p_days_left > 7 then null
    when p_days_left < 0 then -1
    when p_days_left = 0 then 0
    when p_days_left <= 2 then 2
    else 7
  end
$$;

-- The log becomes one row per case, stage, due date and person. Rows written before this
-- migration have no person or due date and so match nothing: at worst one reminder repeats.
alter table pd.reminder_log
  add column id      bigint generated always as identity,
  add column user_id uuid,
  add column due_on  date;
alter table pd.reminder_log drop constraint reminder_log_pkey;
alter table pd.reminder_log add primary key (id);
alter table pd.reminder_log drop constraint reminder_log_bucket_check;
alter table pd.reminder_log add constraint reminder_log_bucket_check check (bucket in (7, 2, 0, -1));
create unique index reminder_log_once on pd.reminder_log (case_id, user_id, bucket, due_on, sent_on);

-- Same columns as before (0007), so the app's row type is unchanged apart from bucket -1.
create or replace function pd.reminders_due()
returns table (
  case_id           uuid,
  ref               text,
  type              text,
  clock_state       text,
  due_on            date,
  bucket            int,
  organisation_id   uuid,
  organisation_name text,
  partner_id        uuid,
  partner_name      text,
  user_id           uuid,
  email             text
)
language sql security definer set search_path = pd, pg_temp as $$
  with due as (
    select d.case_id, d.ref, d.type, d.clock_state, d.organisation_id,
           coalesce(d.ack_due, d.response_due) as due_on,
           pd.reminder_bucket(d.days_left) as bucket
    from pd.v_case_deadlines d
    where d.status = 'open' and d.days_left <= 7
  )
  -- distinct: a person with two memberships that both cover a client is told once.
  select distinct due.case_id, due.ref, due.type, due.clock_state, due.due_on, due.bucket,
         o.id, o.name, p.id, p.name, m.user_id, u.email::text
  from due
  join pd.organisations o on o.id = due.organisation_id
  join pd.partners p on p.id = o.partner_id
  join pd.members m on m.partner_id = p.id and (m.organisation_id is null or m.organisation_id = o.id)
  join auth.users u on u.id = m.user_id
  where u.email is not null
    and not exists (
      select 1 from pd.reminder_log l
      where l.case_id = due.case_id and l.user_id = m.user_id
        and l.bucket = due.bucket and l.due_on = due.due_on
        -- An overdue case is repeated nightly; every other stage is sent once.
        and (due.bucket <> -1 or l.sent_on = current_date))
  order by 10, 12, 5, 2
$$;

revoke execute on function pd.reminder_bucket(int) from public, anon;
revoke execute on function pd.reminders_due() from public, anon, authenticated;
grant execute on function pd.reminders_due() to service_role;
