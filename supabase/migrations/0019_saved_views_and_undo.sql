-- Privacy Desk: saved case-list filters, and undoing an inbox decision with a record of it.
--
-- 1. Saved views. A person can name the filters, sort and columns they use on the case list
--    and come back to them on any computer. A view holds no case data, only the choices, and
--    each person sees and changes only their own.
--
-- 2. Undoing a decision. A message declined by mistake, or accepted into a case with the
--    wrong type, could not be taken back. Now:
--      pd.reopen_inbox_item      puts a declined message back in the inbox;
--      pd.return_case_to_inbox   closes the case the message became and puts the message
--                                back in the inbox, so it can be triaged and decided again.
--    Nothing is deleted. The case keeps its reference and its audit trail and is marked as
--    returned; it is left out of the on-time figures and the monthly report, because the
--    request will be counted again under the case it becomes next. Every decision on an
--    inbox item, and every undoing of one, is written to a new append-only log.

-- ---------------------------------------------------------------------------
-- 1. Saved views
-- ---------------------------------------------------------------------------
create table pd.saved_views (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default pd.current_user_id(),
  name        text not null check (length(trim(name)) between 1 and 60),
  -- The case list's address parameters and visible columns, as the app wrote them. The app
  -- checks every value again when it reads a view back, so this is never trusted as given.
  params      jsonb not null check (jsonb_typeof(params) = 'object' and pg_column_size(params) < 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index saved_views_name on pd.saved_views (user_id, lower(trim(name)));

alter table pd.saved_views enable row level security;
create policy saved_views_own on pd.saved_views for all
  using (user_id = (select pd.current_user_id()))
  with check (user_id = (select pd.current_user_id()));
grant select, insert, update, delete on pd.saved_views to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A case that was returned to the inbox
-- ---------------------------------------------------------------------------
alter table pd.cases add column returned_to_inbox boolean not null default false;

-- A returned case stays closed: the way forward is to accept the message again.
create function pd.keep_returned_case_closed() returns trigger language plpgsql as $$
begin
  if old.returned_to_inbox and (new.status <> 'closed' or not new.returned_to_inbox) then
    raise exception 'This case was returned to the inbox. Accept the message again there instead of reopening it'
      using errcode = 'invalid_parameter_value';
  end if;
  return new;
end $$;
create trigger cases_returned_stay_closed before update on pd.cases
  for each row execute function pd.keep_returned_case_closed();

-- The deadline view: unchanged except that a returned case has no "met on time" answer, so it
-- is not counted as met or missed. No date is worked out differently.
create or replace view pd.v_case_deadlines with (security_invoker = true) as
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
    when c.type = 'complaint' and c.acknowledged_on is null then pd.complaint_ack_due(c.received_on, o.region) - pd.today()
    when c.type <> 'complaint' then pd.request_due(c.id) - pd.today()
  end as days_left,
  case
    when c.returned_to_inbox then null
    when c.type = 'complaint' and c.acknowledged_on is not null
      then c.acknowledged_on <= pd.complaint_ack_due(c.received_on, o.region)
    when c.type <> 'complaint' and c.status = 'closed'
      then c.closed_on <= pd.request_due(c.id)
  end as met_on_time
from pd.cases c
join pd.organisations o on o.id = c.organisation_id;

-- The monthly report's numbers: the same as before, leaving returned cases out altogether.
create or replace view pd.v_monthly_client_report with (security_invoker = true) as
with months as (
  select distinct organisation_id, date_trunc('month', d)::date as month
  from (
    select organisation_id, received_on as d from pd.cases where not returned_to_inbox
    union all select organisation_id, closed_on from pd.cases where closed_on is not null and not returned_to_inbox
    union all select organisation_id, acknowledged_on from pd.cases where acknowledged_on is not null and not returned_to_inbox
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
left join pd.cases c on c.organisation_id = m.organisation_id and not c.returned_to_inbox
left join pd.v_case_deadlines d on d.case_id = c.id
group by m.organisation_id, o.name, m.month;

-- ---------------------------------------------------------------------------
-- 3. The inbox log: every decision on a message, and every undoing of one
-- ---------------------------------------------------------------------------
create table pd.inbox_events (
  id               bigint generated always as identity primary key,
  inbox_item_id    uuid not null references pd.inbox_items (id) on delete cascade,
  -- No link to the client's row: entries leave with their message, which leaves with the client.
  organisation_id  uuid not null,
  at               timestamptz not null default now(),
  kind             text not null check (kind in ('accepted', 'declined', 'reopened', 'returned')),
  text             text not null,
  actor            uuid
);
create index inbox_events_item on pd.inbox_events (inbox_item_id, at);
create index inbox_events_org on pd.inbox_events (organisation_id);

alter table pd.inbox_events enable row level security;
create policy inbox_events_read on pd.inbox_events for select using (pd.can_read_org(organisation_id));
-- Read only: rows are written by the trigger below and by nothing else. New tables in this
-- schema are given write access by default (0002), so it is taken away here.
revoke insert, update, delete on pd.inbox_events from authenticated;
grant select on pd.inbox_events to authenticated;

create function pd.block_inbox_event_changes() returns trigger language plpgsql as $$
begin
  -- Rows go only when their inbox item is deleted (retention); nobody edits them.
  if tg_op = 'UPDATE' then
    raise exception 'The inbox log cannot be edited';
  end if;
  if tg_op = 'DELETE' and exists (select 1 from pd.inbox_items where id = old.inbox_item_id) then
    raise exception 'Inbox log entries can only be removed with their message';
  end if;
  return old;
end $$;
create trigger inbox_events_append_only before update or delete on pd.inbox_events
  for each row execute function pd.block_inbox_event_changes();

-- One log entry whenever a message changes state, however that came about. The reason for an
-- undo is handed over in a setting that lasts for the transaction only.
create function pd.log_inbox_decision() returns trigger
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  v_reason text := nullif(trim(coalesce(current_setting('pd.undo_reason', true), '')), '');
  v_ref    text;
  v_kind   text;
  v_text   text;
begin
  if new.status = 'accepted' then
    select ref into v_ref from pd.cases where id = new.case_id;
    v_kind := 'accepted';
    v_text := 'Accepted into case ' || coalesce(v_ref, '?');
  elsif new.status = 'declined' then
    v_kind := 'declined';
    v_text := 'Declined: ' || coalesce(new.decline_reason, '');
  elsif old.status = 'declined' then
    v_kind := 'reopened';
    v_text := 'Put back in the inbox after being declined (' || coalesce(old.decline_reason, 'no reason recorded') || '). Why: '
              || coalesce(v_reason, 'not given');
  else
    select ref into v_ref from pd.cases where id = old.case_id;
    v_kind := 'returned';
    v_text := 'Put back in the inbox from case ' || coalesce(v_ref, '?') || ', which was closed. Why: ' || coalesce(v_reason, 'not given');
  end if;
  insert into pd.inbox_events (inbox_item_id, organisation_id, kind, text, actor)
  values (new.id, new.organisation_id, v_kind, v_text, pd.current_user_id());
  return new;
end $$;
create trigger inbox_items_log_decision after update of status on pd.inbox_items
  for each row when (old.status is distinct from new.status) execute function pd.log_inbox_decision();

-- Decisions made before this log existed, so each message's history starts complete.
insert into pd.inbox_events (inbox_item_id, organisation_id, at, kind, text, actor)
select i.id, i.organisation_id, coalesce(i.decided_at, now()), i.status,
       case i.status when 'accepted' then 'Accepted into case ' || coalesce(c.ref, '?')
                     else 'Declined: ' || coalesce(i.decline_reason, '') end,
       i.decided_by
  from pd.inbox_items i
  left join pd.cases c on c.id = i.case_id
 where i.status in ('accepted', 'declined');

-- ---------------------------------------------------------------------------
-- 4. The two ways to undo
-- ---------------------------------------------------------------------------
create function pd.reopen_inbox_item(p_item_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  it       pd.inbox_items%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into it from pd.inbox_items where id = p_item_id for update;
  if not found or pd.current_user_id() is null or not pd.can_read_org(it.organisation_id) then
    raise exception 'That inbox item is not here' using errcode = 'no_data_found';
  end if;
  if not pd.can_write_org(it.organisation_id) then
    raise exception 'You cannot change items for this client' using errcode = 'insufficient_privilege';
  end if;
  if it.status = 'accepted' then
    raise exception 'This message became a case. Return the case to the inbox from the case page' using errcode = 'invalid_parameter_value';
  end if;
  if it.status <> 'declined' then
    raise exception 'This message is already in the inbox' using errcode = 'invalid_parameter_value';
  end if;
  if v_reason is null then
    raise exception 'Say why it is going back to the inbox' using errcode = 'check_violation';
  end if;
  perform set_config('pd.undo_reason', v_reason, true);
  update pd.inbox_items
     set status = 'new', decline_reason = null, decided_by = null, decided_at = null
   where id = it.id;
end $$;

create function pd.return_case_to_inbox(p_case_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = pd, pg_temp
set timezone = 'Europe/London' as $$
declare
  c        pd.cases%rowtype;
  it       pd.inbox_items%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into c from pd.cases where id = p_case_id for update;
  if not found or pd.current_user_id() is null or not pd.can_read_org(c.organisation_id) then
    raise exception 'That case is not here' using errcode = 'no_data_found';
  end if;
  if not pd.can_write_org(c.organisation_id) then
    raise exception 'You cannot change cases for this client' using errcode = 'insufficient_privilege';
  end if;
  if c.status <> 'open' then
    raise exception 'Only an open case can go back to the inbox. Reopen it first' using errcode = 'invalid_parameter_value';
  end if;
  select * into it from pd.inbox_items where case_id = c.id for update;
  if not found then
    raise exception 'This case was logged by hand, so there is no inbox message to return it to' using errcode = 'invalid_parameter_value';
  end if;
  if v_reason is null then
    raise exception 'Say why the case is going back to the inbox' using errcode = 'check_violation';
  end if;

  update pd.cases
     set status = 'closed', closed_on = pd.today(), outcome = 'Returned to the inbox: ' || v_reason, returned_to_inbox = true
   where id = c.id;
  insert into pd.case_events (case_id, kind, text, actor) values (
    c.id, 'returned',
    'Returned to the inbox so the message can be triaged and decided again. Why: ' || v_reason
      || ' This case is closed, keeps its reference, and is not counted in the on-time figures.',
    pd.current_user_id());

  perform set_config('pd.undo_reason', v_reason, true);
  update pd.inbox_items
     set status = 'new', case_id = null, decided_by = null, decided_at = null
   where id = it.id;
  return it.id;
end $$;

revoke execute on function pd.reopen_inbox_item(uuid, text) from public, anon;
revoke execute on function pd.return_case_to_inbox(uuid, text) from public, anon;
grant execute on function pd.reopen_inbox_item(uuid, text) to authenticated;
grant execute on function pd.return_case_to_inbox(uuid, text) to authenticated;
revoke execute on function pd.log_inbox_decision() from public, anon, authenticated;
