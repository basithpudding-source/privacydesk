-- Tests for privacy_desk_schema.sql: ICO worked examples, audit trail, and client separation.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Extra holidays only for the ICO's 2024 example.
insert into pd.bank_holidays values ('england-and-wales', '2024-12-25', 'Christmas Day'), ('england-and-wales', '2024-12-26', 'Boxing Day');

insert into pd.partners (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Partner A'),
  ('22222222-2222-2222-2222-222222222222', 'Partner B');
insert into pd.organisations (id, partner_id, name, code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Client A1', 'AAA'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Client A2', 'AAB'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Client B1', 'BBB');
insert into pd.members (user_id, partner_id, organisation_id, role) values
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', null, 'partner_admin'),
  ('00000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', null, 'partner_admin'),
  ('00000000-0000-0000-0000-00000000000c', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'read_only');

insert into pd.cases (id, organisation_id, ref, type, received_on, extended, id_required, id_received_on) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-1', 'complaint', '2025-06-05', false, false, null),
  ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-2', 'sar', '2027-01-01', false, false, null),
  ('c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-3', 'sar', '2028-01-31', false, false, null),
  ('c0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-4', 'sar', '2024-11-25', false, false, null),
  ('c0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-5', 'sar', '2025-08-07', true, false, null),
  ('c0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-6', 'sar', '2025-05-14', false, false, null),
  ('c0000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-7', 'sar', '2026-11-02', false, true, null),
  ('c0000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000002', 'T-8', 'sar', '2026-11-02', false, true, '2026-11-05'),
  ('c0000000-0000-0000-0000-000000000009', 'bbbbbbbb-0000-0000-0000-000000000001', 'T-9', 'complaint', '2026-11-25', false, false, null);
insert into pd.clock_pauses (case_id, paused_on, resumed_on) values ('c0000000-0000-0000-0000-000000000006', '2025-05-15', '2025-05-18');

create temp table expect (ref text, ack date, resp date, state text);
insert into expect values
  ('T-1', '2025-07-07', null, 'awaiting_ack'),  -- ICO: Thu 5 Jun -> Sat 5 Jul -> Mon 7 Jul
  ('T-2', null, '2027-02-01', 'running'),        -- ICO: 1 Jan (bank holiday) -> 1 Feb
  ('T-3', null, '2028-02-29', 'running'),        -- ICO: 31 Jan -> last day of Feb (leap year)
  ('T-4', null, '2024-12-27', 'running'),        -- ICO: Mon 25 Nov -> Fri 27 Dec past Christmas
  ('T-5', null, '2025-11-07', 'extended'),       -- ICO: 7 Aug extended -> 7 Nov
  ('T-6', null, '2025-06-18', 'running'),        -- ICO: 14 May, paused 15-18 May -> 18 Jun
  ('T-7', null, null, 'waiting_id'),
  ('T-8', null, '2026-12-07', 'running'),        -- ID 5 Nov -> Sat 5 Dec -> Mon 7 Dec
  ('T-9', '2026-12-29', null, 'awaiting_ack');   -- 25 Nov + 30 = Fri 25 Dec -> Mon 28 Dec (holiday) -> Tue 29 Dec

select e.ref,
       d.ack_due, e.ack as ack_expected, d.response_due, e.resp as resp_expected, d.clock_state,
       case when d.ack_due is not distinct from e.ack and d.response_due is not distinct from e.resp and d.clock_state = e.state
            then 'PASS' else 'FAIL' end as result
from expect e join pd.v_case_deadlines d on d.ref = e.ref order by e.ref;

do $$ begin
  if exists (select 1 from expect e join pd.v_case_deadlines d on d.ref = e.ref
             where d.ack_due is distinct from e.ack or d.response_due is distinct from e.resp or d.clock_state <> e.state)
  then raise exception 'Deadline tests failed'; end if;
end $$;

-- Audit trail is append-only.
insert into pd.case_events (case_id, kind, text) values ('c0000000-0000-0000-0000-000000000001', 'created', 'Test event');
do $$ begin
  begin update pd.case_events set text = 'changed'; raise exception 'UPDATE was allowed';
  exception when raise_exception then if sqlerrm = 'UPDATE was allowed' then raise; end if; end;
  begin delete from pd.case_events; raise exception 'DELETE was allowed';
  exception when raise_exception then if sqlerrm = 'DELETE was allowed' then raise; end if; end;
  raise notice 'PASS audit trail cannot be edited or deleted on its own';
end $$;

-- Deleting a case (retention) removes its events too.
insert into pd.cases (id, organisation_id, ref, type, received_on, status, closed_on) values
  ('c0000000-0000-0000-0000-0000000000ff', 'aaaaaaaa-0000-0000-0000-000000000001', 'OLD-1', 'sar', '2020-01-06', 'closed', '2020-02-01');
insert into pd.case_events (case_id, kind, text) values ('c0000000-0000-0000-0000-0000000000ff', 'created', 'Old');
select 'retention deleted ' || pd.apply_retention() || ' case(s)' as retention;
select case when not exists (select 1 from pd.case_events where case_id = 'c0000000-0000-0000-0000-0000000000ff') then 'PASS retention removed events' else 'FAIL' end;

-- Client separation through row-level security.
create role app_user nologin;
grant app_user to current_user;  -- lets a non-superuser (Supabase's postgres) switch to it below
grant usage on schema pd to app_user;
grant select, insert, update on all tables in schema pd to app_user;
grant execute on all functions in schema pd to app_user;
set role app_user;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select 'partner A admin sees ' || count(*) || ' cases (expect 8)' as rls from pd.cases;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select 'partner B admin sees ' || count(*) || ' cases (expect 1)' as rls from pd.cases;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select 'read-only client user sees ' || count(*) || ' cases (expect 1)' as rls from pd.cases;
do $$ begin
  begin
    insert into pd.cases (organisation_id, ref, type, received_on) values ('aaaaaaaa-0000-0000-0000-000000000002', 'X-1', 'sar', current_date);
    raise exception 'read-only insert was allowed';
  exception when insufficient_privilege then raise notice 'PASS read-only user cannot add cases';
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  begin
    insert into pd.cases (organisation_id, ref, type, received_on) values ('aaaaaaaa-0000-0000-0000-000000000001', 'X-2', 'sar', current_date);
    raise exception 'cross-partner insert was allowed';
  exception when insufficient_privilege then raise notice 'PASS partner B cannot write to partner A''s client';
  end;
end $$;

-- Creating cases and acting on them (0004). Partner A's admin, client A1.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
create temp table t_case as
  -- Action dates must not be in the future, so this scenario sits in October 2026.
  select pd.create_case('aaaaaaaa-0000-0000-0000-000000000001', 'sar', '2026-10-02', 'Email',
                        ' Sam Sample ', 'SAM@example.com', 'Wants their file', null, true) as id;
select 'ref ' || ref || ' (expect AAA-001), requester ' || requester_name || ' <' || requester_email || '>' as created
  from pd.cases where id = (select id from t_case);
select 'state ' || clock_state || ' (expect waiting_id), due ' || coalesce(response_due::text, 'none') || ' (expect none)' as created
  from pd.v_case_deadlines where case_id = (select id from t_case);
select pd.record_case_action((select id from t_case), 'acknowledge', '2026-10-03');
select pd.record_case_action((select id from t_case), 'id_received', '2026-10-05');
select 'due after ID ' || response_due || ' (expect 2026-11-05: one month from 5 Oct)' as actions
  from pd.v_case_deadlines where case_id = (select id from t_case);
select pd.record_case_action((select id from t_case), 'pause', '2026-10-10', 'Which years?');
do $$ begin
  begin
    perform pd.record_case_action((select id from t_case), 'pause', '2026-10-11', 'Again');
    raise exception 'second clarification was allowed';
  exception when invalid_parameter_value then raise notice 'PASS a second open clarification is refused';
  end;
end $$;
select 'state ' || clock_state || ' (expect paused), due ' || coalesce(response_due::text, 'none') || ' (expect none)' as actions
  from pd.v_case_deadlines where case_id = (select id from t_case);
select pd.record_case_action((select id from t_case), 'resume', '2026-10-12');
select 'due after 3 paused days ' || response_due || ' (expect 2026-11-09: 5 Nov + 3 = Sun 8 Nov, so Mon 9 Nov)' as actions
  from pd.v_case_deadlines where case_id = (select id from t_case);
select pd.record_case_action((select id from t_case), 'extend', '2026-10-20', 'Records at two sites');
select 'due after extension ' || response_due || ' (expect 2027-01-08: 5 Jan + 3 days = Fri 8 Jan)' as actions
  from pd.v_case_deadlines where case_id = (select id from t_case);
select pd.record_case_action((select id from t_case), 'note', current_date, 'Searching the archive');
select pd.record_case_action((select id from t_case), 'close', current_date);
select 'status ' || status || ' (expect closed), outcome ' || outcome as actions from pd.cases where id = (select id from t_case);
select pd.record_case_action((select id from t_case), 'reopen', current_date, 'Missed a folder');
select 'status ' || status || ' (expect open), events ' || (select count(*) from pd.case_events where case_id = c.id) || ' (expect 9)' as actions
  from pd.cases c where id = (select id from t_case);

create temp table t_complaint as
  select pd.create_case('aaaaaaaa-0000-0000-0000-000000000001', 'complaint', '2026-10-02') as id;
select 'complaint ref ' || ref || ' (expect AAA-002), ack due ' || (select ack_due from pd.v_case_deadlines where case_id = c.id)
  || ' (expect 2026-11-02: day 30 is Sun 1 Nov)' as created from pd.cases c where id = (select id from t_complaint);
do $$ begin
  begin
    perform pd.record_case_action((select id from t_complaint), 'extend', current_date, 'no');
    raise exception 'complaint extension was allowed';
  exception when invalid_parameter_value then raise notice 'PASS a complaint cannot be extended';
  end;
  begin
    perform pd.record_case_action((select id from t_complaint), 'close', current_date);
    raise exception 'complaint closed without an outcome';
  exception when check_violation then raise notice 'PASS a complaint needs an outcome to close';
  end;
end $$;
select pd.record_case_action((select id from t_complaint), 'close', current_date, null, 'Not upheld');
select 'complaint outcome ' || outcome || ' (expect Not upheld)' as actions from pd.cases where id = (select id from t_complaint);

-- Inbox (0005): an email arrives by token, a person accepts it into a case, another is declined.
create temp table t_item as
  select pd.receive_inbound_email((select inbound_token from pd.organisations where code = 'AAA'),
    'Pat Example', 'PAT@example.com', 'My data', 'Please send me everything you hold about me.', 'msg-1') as id;
select 'duplicate delivery returns ' || coalesce(pd.receive_inbound_email((select inbound_token from pd.organisations where code = 'AAA'),
    'Pat Example', 'pat@example.com', 'My data', 'Please send me everything you hold about me.', 'msg-1')::text, 'null (expect null)') as inbox;
select pd.set_inbox_triage((select inbound_token from pd.organisations where code = 'AAA'), (select id from t_item),
  '{"by":"ai","type":"sar","confidence":0.93,"summary":"Wants a copy of their data"}'::jsonb);
do $$ begin
  begin
    perform pd.receive_inbound_email('not-a-token', 'x', 'x@example.com', 's', 'body');
    raise exception 'unknown token was accepted';
  exception when no_data_found then raise notice 'PASS an unknown forwarding token is refused';
  end;
end $$;
create temp table t_accepted as
  select pd.accept_inbox_item((select id from t_item), 'sar', '2026-10-06', 'Pat Example', 'pat@example.com', 'Wants a copy of their data', false) as case_id;
select 'accepted into ' || c.ref || ' (expect AAA-003), channel ' || c.channel || ', item status ' || i.status as inbox
  from pd.cases c join pd.inbox_items i on i.case_id = c.id where c.id = (select case_id from t_accepted);
select 'audit: ' || text as inbox from pd.case_events where case_id = (select case_id from t_accepted) and kind = 'triage';
do $$ begin
  begin
    perform pd.accept_inbox_item((select id from t_item), 'sar', '2026-10-06');
    raise exception 'accepted twice';
  exception when invalid_parameter_value then raise notice 'PASS an item cannot be accepted twice';
  end;
end $$;
insert into pd.inbox_items (organisation_id, channel, body) values ('aaaaaaaa-0000-0000-0000-000000000001', 'paste', 'Spam about car insurance');
select pd.decline_inbox_item((select id from pd.inbox_items where body like 'Spam%'), 'Not about personal data');
select 'declined item status ' || status || ', reason ' || decline_reason as inbox from pd.inbox_items where body like 'Spam%';

-- A read-only user can see but not act.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  begin
    perform pd.record_case_action('c0000000-0000-0000-0000-000000000008', 'note', current_date, 'hello');
    raise exception 'read-only action was allowed';
  exception when insufficient_privilege then raise notice 'PASS read-only user cannot act on a case';
  end;
  begin
    perform pd.decline_inbox_item((select id from pd.inbox_items where body like 'Spam%'), 'again');
    raise exception 'read-only decline was allowed';
  exception when insufficient_privilege or invalid_parameter_value then raise notice 'PASS read-only user cannot decide inbox items';
  end;
end $$;
select 'partner B admin sees ' || count(*) || ' inbox items (expect 0)' as rls from pd.inbox_items
  where pd.current_user_id() = (select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false))::uuid;

-- Client organisations are separated the same way as cases.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select 'partner A admin sees ' || count(*) || ' clients (expect 2)' as rls from pd.organisations;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select 'partner B admin sees ' || count(*) || ' clients (expect 1)' as rls from pd.organisations;

-- A new user can create their consultancy once, and becomes its admin.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select 'new user sees ' || count(*) || ' partners before creating one (expect 0)' as onboarding from pd.partners;
select pd.create_partner('  Partner D  ') as new_partner;
select 'new user sees ' || count(*) || ' partner after creating one (expect 1)' as onboarding from pd.partners;
select case when exists (select 1 from pd.members where user_id = '00000000-0000-0000-0000-00000000000d' and role = 'partner_admin' and organisation_id is null)
            then 'PASS creator is the partner admin' else 'FAIL creator is not the partner admin' end as onboarding;
do $$ begin
  begin
    perform pd.create_partner('Partner D again');
    raise exception 'second consultancy was allowed';
  exception when unique_violation then raise notice 'PASS a user cannot create a second consultancy';
  end;
end $$;
reset role;

select organisation, month, received, complaints, sars, closed from pd.v_monthly_client_report order by organisation, month limit 5;
