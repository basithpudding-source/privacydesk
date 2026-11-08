-- Privacy Desk: production database schema (PostgreSQL 15+, Supabase-compatible).
-- One partner (a DPO consultancy) owns many client organisations; each organisation owns its cases.
-- Deadline rules follow ICO guidance; see the plan doc for sources.
--
-- Supabase: run as-is. pd.current_user_id() reads the signed-in user's id from the request JWT
-- (the same setting auth.uid() reads). Locally, set it with:
--   select set_config('request.jwt.claim.sub', '<user uuid>', false);

create schema if not exists pd;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table pd.partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table pd.organisations (
  id                    uuid primary key default gen_random_uuid(),
  partner_id            uuid not null references pd.partners (id) on delete cascade,
  name                  text not null,
  code                  text not null check (code ~ '^[A-Z0-9]{2,6}$'),
  colour                text not null default '#1d5c86' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  region                text not null default 'england-and-wales'
                          check (region in ('england-and-wales', 'scotland', 'northern-ireland')),
  internal_target_days  int  not null default 28 check (internal_target_days between 1 and 90),
  retention_months      int  not null default 36 check (retention_months between 6 and 120),
  ai_enabled            boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (partner_id, code)
);

-- organisation_id null = access to every client of the partner.
create table pd.members (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  partner_id       uuid not null references pd.partners (id) on delete cascade,
  organisation_id  uuid references pd.organisations (id) on delete cascade,
  role             text not null check (role in ('partner_admin', 'client_user', 'read_only')),
  created_at       timestamptz not null default now()
);
create unique index members_unique on pd.members
  (user_id, partner_id, coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------

create table pd.cases (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references pd.organisations (id) on delete cascade,
  ref              text not null unique,
  type             text not null check (type in ('complaint', 'sar', 'erasure', 'rectification', 'objection')),
  status           text not null default 'open' check (status in ('open', 'closed')),
  channel          text not null default 'Email',
  requester_name   text,
  requester_email  text,
  received_on      date not null,
  summary          text,
  message          text,
  id_required      boolean not null default false,
  id_received_on   date,
  extended         boolean not null default false,
  extended_on      date,
  acknowledged_on  date,
  closed_on        date,
  outcome          text,
  triage           jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (id_received_on is null or id_required),
  check (extended = false or type <> 'complaint'),
  check (closed_on is null or status = 'closed'),
  check (acknowledged_on is null or acknowledged_on >= received_on)
);
create index cases_org_status on pd.cases (organisation_id, status);

-- Stop-the-clock periods (SARs and other rights requests).
create table pd.clock_pauses (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references pd.cases (id) on delete cascade,
  paused_on   date not null,
  resumed_on  date,          -- the day clarification arrived; null while still waiting
  note        text,
  check (resumed_on is null or resumed_on >= paused_on)
);
create unique index one_open_pause_per_case on pd.clock_pauses (case_id) where resumed_on is null;

-- Append-only audit trail.
create table pd.case_events (
  id        bigint generated always as identity primary key,
  case_id   uuid not null references pd.cases (id) on delete cascade,
  at        timestamptz not null default now(),
  kind      text not null,
  text      text not null,
  actor     uuid
);
create index case_events_case on pd.case_events (case_id, at);

create function pd.block_event_changes() returns trigger language plpgsql as $$
begin
  -- Rows go only when their case is deleted (retention); nobody edits them.
  if tg_op = 'UPDATE' then
    raise exception 'The audit trail cannot be edited';
  end if;
  if tg_op = 'DELETE' and exists (select 1 from pd.cases where id = old.case_id) then
    raise exception 'Audit events can only be removed with their case';
  end if;
  return old;
end $$;
create trigger case_events_append_only before update or delete on pd.case_events
  for each row execute function pd.block_event_changes();

-- Bank holidays per UK nation. Production: refresh nightly from https://www.gov.uk/bank-holidays.json
create table pd.bank_holidays (
  region  text not null check (region in ('england-and-wales', 'scotland', 'northern-ireland')),
  day     date not null,
  name    text not null,
  primary key (region, day)
);

insert into pd.bank_holidays (region, day, name) values
  ('england-and-wales', '2026-01-01', 'New Year''s Day'),
  ('england-and-wales', '2026-04-03', 'Good Friday'),
  ('england-and-wales', '2026-04-06', 'Easter Monday'),
  ('england-and-wales', '2026-05-04', 'Early May bank holiday'),
  ('england-and-wales', '2026-05-25', 'Spring bank holiday'),
  ('england-and-wales', '2026-08-31', 'Summer bank holiday'),
  ('england-and-wales', '2026-12-25', 'Christmas Day'),
  ('england-and-wales', '2026-12-28', 'Boxing Day (substitute day)'),
  ('england-and-wales', '2027-01-01', 'New Year''s Day'),
  ('england-and-wales', '2027-03-26', 'Good Friday'),
  ('england-and-wales', '2027-03-29', 'Easter Monday'),
  ('england-and-wales', '2027-05-03', 'Early May bank holiday'),
  ('england-and-wales', '2027-05-31', 'Spring bank holiday'),
  ('england-and-wales', '2027-08-30', 'Summer bank holiday'),
  ('england-and-wales', '2027-12-27', 'Christmas Day (substitute day)'),
  ('england-and-wales', '2027-12-28', 'Boxing Day (substitute day)');

-- ---------------------------------------------------------------------------
-- Deadline rules
-- ---------------------------------------------------------------------------

create function pd.next_working_day(d date, p_region text) returns date
language sql stable as $$
  select min(x)::date
  from generate_series(d, d + 14, interval '1 day') as g(x)
  where extract(isodow from x) < 6
    and not exists (select 1 from pd.bank_holidays h where h.region = p_region and h.day = x::date)
$$;

-- Complaints: 30 days, day 1 is the day after receipt; a weekend or holiday moves to the next working day.
create function pd.complaint_ack_due(received date, p_region text) returns date
language sql stable as $$ select pd.next_working_day(received + 30, p_region) $$;

-- SARs and other rights requests: calendar month(s) from the start date (Postgres clamps 31 Jan + 1 month
-- to the end of February), plus days the clock was stopped, then the next working day.
-- Returns null while waiting for ID or while the clock is stopped.
create function pd.request_due(p_case_id uuid) returns date
language sql stable as $$
  select case
    when c.id_required and c.id_received_on is null then null
    when exists (select 1 from pd.clock_pauses p where p.case_id = c.id and p.resumed_on is null) then null
    else pd.next_working_day(
      ((case when c.id_required then c.id_received_on else c.received_on end)
        + make_interval(months => case when c.extended then 3 else 1 end))::date
      + coalesce((select sum(p.resumed_on - p.paused_on + 1)::int
                  from pd.clock_pauses p where p.case_id = c.id), 0),
      o.region)
  end
  from pd.cases c join pd.organisations o on o.id = c.organisation_id
  where c.id = p_case_id
$$;

create view pd.v_case_deadlines with (security_invoker = true) as
select
  c.id as case_id, c.ref, c.organisation_id, c.type, c.status, c.received_on,
  case
    when c.status = 'closed' then 'closed'
    when c.type = 'complaint' and c.acknowledged_on is null then 'awaiting_ack'
    when c.type = 'complaint' then 'acknowledged'
    when c.id_required and c.id_received_on is null then 'waiting_id'
    when exists (select 1 from pd.clock_pauses p where p.case_id = c.id and p.resumed_on is null) then 'paused'
    when c.extended then 'extended'
    else 'running'
  end as clock_state,
  case when c.type = 'complaint' then pd.complaint_ack_due(c.received_on, o.region) end as ack_due,
  case when c.type <> 'complaint' then pd.request_due(c.id) end as response_due,
  case when c.type = 'complaint' then c.received_on + o.internal_target_days end as internal_target,
  case
    when c.status = 'closed' then null
    when c.type = 'complaint' and c.acknowledged_on is null then pd.complaint_ack_due(c.received_on, o.region) - current_date
    when c.type <> 'complaint' then pd.request_due(c.id) - current_date
  end as days_left,
  case
    when c.type = 'complaint' and c.acknowledged_on is not null
      then c.acknowledged_on <= pd.complaint_ack_due(c.received_on, o.region)
    when c.type <> 'complaint' and c.status = 'closed'
      then c.closed_on <= pd.request_due(c.id)
  end as met_on_time
from pd.cases c
join pd.organisations o on o.id = c.organisation_id;

-- One row per client per month: the numbers behind the monthly client report.
create view pd.v_monthly_client_report with (security_invoker = true) as
with months as (
  select distinct organisation_id, date_trunc('month', d)::date as month
  from (
    select organisation_id, received_on as d from pd.cases
    union all select organisation_id, closed_on from pd.cases where closed_on is not null
    union all select organisation_id, acknowledged_on from pd.cases where acknowledged_on is not null
  ) x
)
select
  m.organisation_id, o.name as organisation, m.month,
  count(*) filter (where date_trunc('month', d.received_on) = m.month) as received,
  count(*) filter (where date_trunc('month', d.received_on) = m.month and d.type = 'complaint') as complaints,
  count(*) filter (where date_trunc('month', d.received_on) = m.month and d.type = 'sar') as sars,
  count(*) filter (where date_trunc('month', c.acknowledged_on) = m.month and d.type = 'complaint') as complaints_acknowledged,
  count(*) filter (where date_trunc('month', c.acknowledged_on) = m.month and d.type = 'complaint' and d.met_on_time) as acknowledged_on_time,
  count(*) filter (where date_trunc('month', c.closed_on) = m.month) as closed,
  count(*) filter (where date_trunc('month', c.closed_on) = m.month and coalesce(d.met_on_time, true)) as closed_on_time
from months m
join pd.organisations o on o.id = m.organisation_id
left join pd.cases c on c.organisation_id = m.organisation_id
left join pd.v_case_deadlines d on d.case_id = c.id
group by m.organisation_id, o.name, m.month;

-- ---------------------------------------------------------------------------
-- Access: every row is reachable only through a membership
-- ---------------------------------------------------------------------------

create function pd.current_user_id() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create function pd.can_read_org(p_org uuid) returns boolean
language sql stable security definer set search_path = pd, pg_temp as $$
  select exists (
    select 1 from pd.members m join pd.organisations o on o.partner_id = m.partner_id
    where o.id = p_org and m.user_id = pd.current_user_id()
      and (m.organisation_id is null or m.organisation_id = o.id))
$$;

create function pd.can_write_org(p_org uuid) returns boolean
language sql stable security definer set search_path = pd, pg_temp as $$
  select exists (
    select 1 from pd.members m join pd.organisations o on o.partner_id = m.partner_id
    where o.id = p_org and m.user_id = pd.current_user_id() and m.role <> 'read_only'
      and (m.organisation_id is null or m.organisation_id = o.id))
$$;

create function pd.is_partner_admin(p_partner uuid) returns boolean
language sql stable security definer set search_path = pd, pg_temp as $$
  select exists (select 1 from pd.members m where m.partner_id = p_partner
                 and m.user_id = pd.current_user_id() and m.role = 'partner_admin' and m.organisation_id is null)
$$;

alter table pd.partners      enable row level security;
alter table pd.organisations enable row level security;
alter table pd.members       enable row level security;
alter table pd.cases         enable row level security;
alter table pd.clock_pauses  enable row level security;
alter table pd.case_events   enable row level security;
alter table pd.bank_holidays enable row level security;

create policy partners_read on pd.partners for select
  using (exists (select 1 from pd.members m where m.partner_id = partners.id and m.user_id = pd.current_user_id()));

create policy orgs_read  on pd.organisations for select using (pd.can_read_org(id));
create policy orgs_admin on pd.organisations for all
  using (pd.is_partner_admin(partner_id)) with check (pd.is_partner_admin(partner_id));

create policy members_self  on pd.members for select using (user_id = pd.current_user_id());
create policy members_admin on pd.members for all
  using (pd.is_partner_admin(partner_id)) with check (pd.is_partner_admin(partner_id));

create policy cases_read   on pd.cases for select using (pd.can_read_org(organisation_id));
create policy cases_insert on pd.cases for insert with check (pd.can_write_org(organisation_id));
create policy cases_update on pd.cases for update
  using (pd.can_write_org(organisation_id)) with check (pd.can_write_org(organisation_id));
-- Deleting cases is left to the retention job (service role), not to users.

create policy pauses_read  on pd.clock_pauses for select
  using (exists (select 1 from pd.cases c where c.id = case_id and pd.can_read_org(c.organisation_id)));
create policy pauses_write on pd.clock_pauses for all
  using (exists (select 1 from pd.cases c where c.id = case_id and pd.can_write_org(c.organisation_id)))
  with check (exists (select 1 from pd.cases c where c.id = case_id and pd.can_write_org(c.organisation_id)));

create policy events_read on pd.case_events for select
  using (exists (select 1 from pd.cases c where c.id = case_id and pd.can_read_org(c.organisation_id)));
create policy events_add on pd.case_events for insert
  with check (actor = pd.current_user_id()
    and exists (select 1 from pd.cases c where c.id = case_id and pd.can_write_org(c.organisation_id)));

create policy holidays_read on pd.bank_holidays for select using (true);

-- ---------------------------------------------------------------------------
-- Retention: run nightly as the service role (for example with pg_cron).
-- Deletes closed cases older than each client's retention period, with their pauses and events.
-- ---------------------------------------------------------------------------

create function pd.apply_retention() returns int
language plpgsql security definer set search_path = pd, pg_temp as $$
declare n int;
begin
  delete from pd.cases c using pd.organisations o
  where o.id = c.organisation_id and c.status = 'closed'
    and c.closed_on < current_date - make_interval(months => o.retention_months);
  get diagnostics n = row_count;
  return n;
end $$;
