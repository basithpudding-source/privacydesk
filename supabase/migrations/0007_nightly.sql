-- Privacy Desk: the nightly job (slice 6). Three things run once a night, from the app's
-- /api/jobs/nightly route using the service role: reminder digests to the consultancy's own
-- staff, a refresh of bank holidays from GOV.UK, and the retention function from 0001.
--
-- The service role is the one key that sees every consultancy. It is used by that route only,
-- server-side, and gets exactly the grants below: no blanket access to the schema.

-- ---------------------------------------------------------------------------
-- Which reminders have gone, so the job can run twice in a night without repeating itself.
-- Members may read it (a case page could show "reminded on"); only the job writes it.
-- ---------------------------------------------------------------------------
create table pd.reminder_log (
  case_id     uuid not null references pd.cases (id) on delete cascade,
  bucket      int  not null check (bucket in (7, 2, 0)),   -- days left when the reminder went
  sent_on     date not null default current_date,
  recipients  int  not null default 0,
  primary key (case_id, bucket, sent_on)
);
alter table pd.reminder_log enable row level security;
revoke all on pd.reminder_log from anon, authenticated;
grant select on pd.reminder_log to authenticated;
create policy reminders_read on pd.reminder_log for select
  using (exists (select 1 from pd.cases c where c.id = case_id and pd.can_read_org(c.organisation_id)));

-- ---------------------------------------------------------------------------
-- Reminders due today: every open case 7 days, 2 days or 0 days from its legal deadline,
-- once per member who can see it, skipping any (case, bucket) already logged today.
-- Definer rights: it reads every consultancy and joins auth.users for the addresses.
-- ---------------------------------------------------------------------------
create function pd.reminders_due()
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
  select d.case_id, d.ref, d.type, d.clock_state,
         coalesce(d.ack_due, d.response_due) as due_on,
         d.days_left as bucket,
         o.id, o.name, p.id, p.name,
         m.user_id, u.email::text
  from pd.v_case_deadlines d
  join pd.organisations o on o.id = d.organisation_id
  join pd.partners p on p.id = o.partner_id
  join pd.members m on m.partner_id = p.id and (m.organisation_id is null or m.organisation_id = o.id)
  join auth.users u on u.id = m.user_id
  where d.status = 'open'
    and d.days_left in (7, 2, 0)
    and u.email is not null
    and not exists (select 1 from pd.reminder_log l
                    where l.case_id = d.case_id and l.bucket = d.days_left and l.sent_on = current_date)
  order by p.name, u.email, due_on, d.ref
$$;

revoke execute on function pd.reminders_due() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the service role may do in pd: run the job, and nothing else.
-- ---------------------------------------------------------------------------
grant usage on schema pd to service_role;
grant execute on function pd.reminders_due() to service_role;
grant execute on function pd.apply_retention() to service_role;
grant insert on pd.reminder_log to service_role;
grant select, insert, update on pd.bank_holidays to service_role;

-- The public form's confirmation works out a response date, so it needs the holidays too.
-- They are public information (the table's read policy already says so).
grant select on pd.bank_holidays to anon;
