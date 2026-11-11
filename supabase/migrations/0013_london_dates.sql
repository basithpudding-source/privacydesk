-- Privacy Desk: "today" is the date in London.
--
-- The database runs on UTC, which is an hour behind the UK during British Summer Time. Between
-- midnight and 1am in summer, current_date was still yesterday: days left were one too many,
-- a case received "today" was refused as being in the future, and the nightly job could log a
-- reminder against the wrong day. pd.form_verify (0006) already used London time; now
-- everything does.
--
-- Two mechanisms, one meaning:
--   - pd.today() for views and defaults, which cannot carry a setting of their own;
--   - "set timezone" on the functions that use current_date, so their bodies stay as written.
-- The app does the same in src/lib/today.ts.

create function pd.today() returns date
language sql stable as $$
  select (now() at time zone 'Europe/London')::date
$$;

-- The deadline view: the same columns as 0001, with days left counted from London's date.
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
    when c.type = 'complaint' and c.acknowledged_on is not null
      then c.acknowledged_on <= pd.complaint_ack_due(c.received_on, o.region)
    when c.type <> 'complaint' and c.status = 'closed'
      then c.closed_on <= pd.request_due(c.id)
  end as met_on_time
from pd.cases c
join pd.organisations o on o.id = c.organisation_id;

alter table pd.reminder_log alter column sent_on set default pd.today();

-- Inside these, current_date is now London's date.
alter function pd.create_case(uuid, text, date, text, text, text, text, text, boolean) set timezone = 'Europe/London';
alter function pd.record_case_action(uuid, text, date, text, text) set timezone = 'Europe/London';
alter function pd.apply_retention() set timezone = 'Europe/London';
alter function pd.reminders_due() set timezone = 'Europe/London';
