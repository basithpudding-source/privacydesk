-- Tests for privacy_desk_schema.sql: ICO worked examples, audit trail, and client separation.
\set ON_ERROR_STOP on
set client_min_messages = warning;
-- Since 0008 a partner admin sees nothing without a second factor; the tests act as one who has it.
select set_config('request.jwt.claim.aal', 'aal2', false);
-- The public form's server key (0010): the app's server sends it with every form call.
select pd.set_server_key('public_form', 'schema-test-server-key-0123456789abcdef');
-- The inbound webhook's server key (0017).
select pd.set_server_key('inbound_email', 'schema-test-inbound-key-0123456789abcdef');

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
-- It holds exactly what a signed-in user holds, so the grants are tested as well as the policies.
grant authenticated to app_user;
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

-- Audited writes (0009): the functions above are the only way in. Direct changes are refused
-- even for the admin who owns the case, so nothing can change without its audit event.
do $$
declare v_case uuid := (select id from t_case);
begin
  begin
    update pd.cases set received_on = '2026-09-01' where id = v_case;
    raise exception 'a direct case update was allowed';
  exception when insufficient_privilege then raise notice 'PASS a case cannot be updated directly';
  end;
  begin
    insert into pd.cases (organisation_id, ref, type, received_on) values ('aaaaaaaa-0000-0000-0000-000000000001', 'X-3', 'sar', current_date);
    raise exception 'a direct case insert was allowed';
  exception when insufficient_privilege then raise notice 'PASS a case cannot be inserted directly';
  end;
  begin
    insert into pd.case_events (case_id, kind, text, actor) values (v_case, 'note', 'Forged', pd.current_user_id());
    raise exception 'a direct audit event was allowed';
  exception when insufficient_privilege then raise notice 'PASS an audit event cannot be written directly';
  end;
  begin
    insert into pd.clock_pauses (case_id, paused_on) values (v_case, '2026-10-21');
    raise exception 'a direct clock pause was allowed';
  exception when insufficient_privilege then raise notice 'PASS the clock cannot be stopped directly';
  end;
  begin
    update pd.inbox_items set status = 'declined', decline_reason = 'quietly' where true;
    raise exception 'a direct inbox update was allowed';
  exception when insufficient_privilege then raise notice 'PASS an inbox item cannot be changed directly';
  end;
end $$;

-- Clients (0016): an admin can add and edit a client but not delete one, because the delete
-- would take every case and audit event with it and leave no record.
do $$ begin
  begin
    delete from pd.organisations where id = 'aaaaaaaa-0000-0000-0000-000000000002';
    raise exception 'a client was deleted through the API';
  exception when insufficient_privilege then raise notice 'PASS a client cannot be deleted by a user';
  end;
  update pd.organisations set internal_target_days = 21 where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if not found then raise exception 'an admin could not edit their own client'; end if;
  insert into pd.organisations (partner_id, name, code) values ('11111111-1111-1111-1111-111111111111', 'Client A3', 'AAC');
  begin
    insert into pd.organisations (partner_id, name, code) values ('22222222-2222-2222-2222-222222222222', 'Not mine', 'BBX');
    raise exception 'a client was added to another consultancy';
  exception when insufficient_privilege then raise notice 'PASS a client cannot be added to another consultancy';
  end;
end $$;
select 'partner A admin sees ' || count(*) || ' clients after adding one (expect 3)' as clients from pd.organisations;

-- Inbox (0005): an email arrives by token, a person accepts it into a case, another is declined.
create temp table t_item as
  select pd.receive_inbound_email((select inbound_token from pd.organisations where code = 'AAA'),
    'Pat Example', 'PAT@example.com', 'My data', 'Please send me everything you hold about me.', 'msg-1', 'schema-test-inbound-key-0123456789abcdef') as id;
select 'duplicate delivery returns ' || coalesce(pd.receive_inbound_email((select inbound_token from pd.organisations where code = 'AAA'),
    'Pat Example', 'pat@example.com', 'My data', 'Please send me everything you hold about me.', 'msg-1', 'schema-test-inbound-key-0123456789abcdef')::text, 'null (expect null)') as inbox;
select pd.set_inbox_triage((select inbound_token from pd.organisations where code = 'AAA'), (select id from t_item),
  '{"by":"ai","type":"sar","confidence":0.93,"summary":"Wants a copy of their data"}'::jsonb, 'schema-test-inbound-key-0123456789abcdef');
do $$ begin
  begin
    perform pd.receive_inbound_email('not-a-token', 'x', 'x@example.com', 's', 'body', null, 'schema-test-inbound-key-0123456789abcdef');
    raise exception 'unknown token was accepted';
  exception when no_data_found then raise notice 'PASS an unknown forwarding token is refused';
  end;
  -- Server key (0017): the forwarding token alone is not enough.
  begin
    perform pd.receive_inbound_email((select inbound_token from pd.organisations where code = 'AAA'), 'Mallory', 'm@example.com', 'Hello', 'Sent straight to the database.', 'msg-x');
    raise exception 'inbound email without the server key was accepted';
  exception when insufficient_privilege then raise notice 'PASS inbound email needs the server key';
  end;
  begin
    perform pd.set_inbox_triage((select inbound_token from pd.organisations where code = 'AAA'), (select id from t_item), '{"by":"ai"}'::jsonb, 'not-the-key');
    raise exception 'triage was set without the server key';
  exception when insufficient_privilege then raise notice 'PASS inbound triage cannot be set without the server key';
  end;
  begin
    perform count(*) from pd.inbound_context((select inbound_token from pd.organisations where code = 'AAA'), null);
    raise exception 'a client was looked up by token without the server key';
  exception when insufficient_privilege then raise notice 'PASS a forwarding token cannot be looked up without the server key';
  end;
end $$;
select 'inbox items for the first client: ' || count(*) || ' (expect 1: the refused calls stored nothing)' as inbox from pd.inbox_items where organisation_id = 'aaaaaaaa-0000-0000-0000-000000000001';
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
select pd.add_inbox_item('aaaaaaaa-0000-0000-0000-000000000001', 'Spam about car insurance') is not null as pasted;
select pd.retriage_inbox_item((select id from pd.inbox_items where body like 'Spam%'), '{"by":"keywords","type":"not_dp","confidence":0.4}'::jsonb);
select pd.add_inbox_item('aaaaaaaa-0000-0000-0000-000000000002', 'A message for the second client') is not null as pasted;
select pd.decline_inbox_item((select id from pd.inbox_items where body like 'Spam%'), 'Not about personal data');
select 'declined item status ' || status || ', reason ' || decline_reason as inbox from pd.inbox_items where body like 'Spam%';

-- Imported emails (0018): the email's own date and id are kept, and a repeat is not stored.
create temp table t_imp as
  select pd.add_inbox_item('aaaaaaaa-0000-0000-0000-000000000002', 'An imported email asking for a copy of my data', 'Imp Orter', 'IMP@example.com',
                           'Imported', null, '2026-10-20 09:30:00+00', '<imp-1@example.com>', 'email') as id;
select 'imported item: ' || channel || ', from ' || from_email || ', received ' || (received_at at time zone 'UTC')::date
       || ' (expect email, from imp@example.com, received 2026-10-20)' as inbox
  from pd.inbox_items where id = (select id from t_imp);
select coalesce(pd.add_inbox_item('aaaaaaaa-0000-0000-0000-000000000002', 'An imported email asking for a copy of my data', 'Imp Orter', 'imp@example.com',
                                  'Imported', null, '2026-10-20 09:30:00+00', '<imp-1@example.com>', 'email')::text,
                'null (expect null: the same email imported twice)') as inbox;
do $$ begin
  begin
    perform pd.add_inbox_item('aaaaaaaa-0000-0000-0000-000000000002', 'An email dated tomorrow, which cannot be right', null, null, null, null, now() + interval '1 day');
    raise exception 'an email from the future was stored';
  exception when check_violation then raise notice 'PASS an imported email cannot be dated in the future';
  end;
  begin
    perform pd.add_inbox_item('aaaaaaaa-0000-0000-0000-000000000002', 'An item that claims to come from the web form', null, null, null, null, null, null, 'form');
    raise exception 'a hand-added item claimed to be a web form';
  exception when check_violation then raise notice 'PASS an item added by hand cannot claim to be a web form submission';
  end;
end $$;
select pd.decline_inbox_item((select id from t_imp), 'Test item for the import checks');

-- Undo (0019): a declined message goes back to the inbox; a case made from a message goes
-- back too, closed and marked, never deleted; and every step is on the inbox log.
do $$ begin
  begin
    perform pd.reopen_inbox_item((select id from t_imp), '   ');
    raise exception 'a message was reopened without a reason';
  exception when check_violation then raise notice 'PASS reopening a declined message needs a reason';
  end;
end $$;
select pd.reopen_inbox_item((select id from t_imp), 'Declined by mistake');
select 'reopened item: ' || status || ', decline reason ' || coalesce(decline_reason, 'cleared') || ' (expect new, decline reason cleared)' as undo
  from pd.inbox_items where id = (select id from t_imp);
create temp table t_ret as select pd.accept_inbox_item((select id from t_imp), 'sar', '2026-10-20') as id;
select pd.record_case_action((select id from t_ret), 'acknowledge', '2026-10-21');
create temp table t_back as select pd.return_case_to_inbox((select id from t_ret), 'Should have been a complaint') as item;
select case when c.status = 'closed' and c.returned_to_inbox and c.outcome like 'Returned to the inbox:%' and d.met_on_time is null
              and i.status = 'new' and i.case_id is null and (select item from t_back) = i.id
            then 'PASS' else 'FAIL' end
       || ' a returned case is closed, marked, not measured, and its message is new again' as undo
  from pd.cases c
  join pd.v_case_deadlines d on d.case_id = c.id
  join pd.inbox_items i on i.id = (select id from t_imp)
 where c.id = (select id from t_ret);
select 'inbox log: ' || string_agg(kind, ', ' order by id) || ' (expect declined, reopened, accepted, returned)' as undo
  from pd.inbox_events where inbox_item_id = (select id from t_imp);
select 'case trail has the return: ' || count(*) || ' (expect 1)' as undo from pd.case_events where case_id = (select id from t_ret) and kind = 'returned';
-- The reason comes last in the audit entry (0020), so it cannot run into the next sentence.
select case when text like 'Returned to the inbox so the message can be triaged and decided again. This case is closed,%Why: Should have been a complaint'
            then 'PASS' else 'FAIL' end || ' the return entry ends with the reason' as undo
  from pd.case_events where case_id = (select id from t_ret) and kind = 'returned';
do $$ begin
  if not exists (select 1 from pd.case_events where case_id = (select id from t_ret) and kind = 'returned' and text like '%figures. Why: Should have been a complaint') then
    raise exception 'Return wording test failed';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pd.cases c join pd.v_case_deadlines d on d.case_id = c.id
                  where c.id = (select id from t_ret) and c.status = 'closed' and c.returned_to_inbox and d.met_on_time is null)
     or (select status from pd.inbox_items where id = (select id from t_imp)) <> 'new'
     or (select string_agg(kind, ',' order by id) from pd.inbox_events where inbox_item_id = (select id from t_imp)) <> 'declined,reopened,accepted,returned' then
    raise exception 'Undo tests failed';
  end if;
  begin
    perform pd.record_case_action((select id from t_ret), 'reopen', current_date, 'Trying to bring it back');
    raise exception 'a returned case was reopened';
  exception when invalid_parameter_value then raise notice 'PASS a returned case cannot be reopened';
  end;
  begin
    perform pd.return_case_to_inbox((select id from t_ret), 'Again');
    raise exception 'a closed case was returned';
  exception when invalid_parameter_value then raise notice 'PASS only an open case can be returned';
  end;
  begin
    update pd.inbox_events set text = 'edited' where inbox_item_id = (select id from t_imp);
    raise exception 'the inbox log was edited';
  exception when insufficient_privilege then raise notice 'PASS the inbox log cannot be edited';
  end;
end $$;
select pd.decline_inbox_item((select id from t_imp), 'Test item for the import and undo checks');

-- Email evidence (0021): a short record of the sent email goes on the same audit entry as the
-- step, only for steps where an email is sent, and a note on an ID request is no longer lost.
create temp table t_ev as
  select pd.create_case('aaaaaaaa-0000-0000-0000-000000000002', 'sar', current_date - 3, 'Email', 'Ev Idence', 'ev@example.com', 'Evidence test', null, false) as id;
select pd.record_case_action((select id from t_ev), 'acknowledge', current_date - 1, null, null,
  'Email evidence: sent 11 Nov 2026 at 14:32 to ev@example.com, the address on the case. Subject: "We have received your request". No attachments. Summary: acknowledged the request and gave the reference.');
select case when text like 'Acknowledgement sent on %. Email evidence: sent 11 Nov 2026 at 14:32 to ev@example.com, the address on the case.%Summary: acknowledged the request and gave the reference.'
            then 'PASS' else 'FAIL' end || ' the evidence is on the same audit entry as the step' as evidence
  from pd.case_events where case_id = (select id from t_ev) and kind = 'acknowledge';
select pd.record_case_action((select id from t_ev), 'ask_id', current_date - 1, 'A passport or driving licence');
select case when text like '%the clock waits until it arrives. Asked for: A passport or driving licence'
            then 'PASS' else 'FAIL' end || ' a note on an ID request is recorded' as evidence
  from pd.case_events where case_id = (select id from t_ev) and kind = 'ask_id';
do $$ begin
  if not exists (select 1 from pd.case_events where case_id = (select id from t_ev) and kind = 'acknowledge' and text like '%. Email evidence: sent 11 Nov 2026%')
     or not exists (select 1 from pd.case_events where case_id = (select id from t_ev) and kind = 'ask_id' and text like '%Asked for: A passport or driving licence')
     or (select acknowledged_on from pd.cases where id = (select id from t_ev)) <> current_date - 1 then
    raise exception 'Email evidence tests failed';
  end if;
  begin
    perform pd.record_case_action((select id from t_ev), 'note', current_date, 'A note', null, 'Email evidence: something');
    raise exception 'evidence was accepted on a step with no email';
  exception when invalid_parameter_value then raise notice 'PASS evidence is refused on a step where no email is sent';
  end;
  begin
    perform pd.record_case_action((select id from t_ev), 'close', current_date, null, null, repeat('x', 1501));
    raise exception 'over-long evidence was accepted';
  exception when check_violation then raise notice 'PASS evidence is kept short';
  end;
end $$;

-- Saved views (0019): each person has their own.
insert into pd.saved_views (name, params) values ('My overdue SARs', '{"status":"overdue","type":"sar"}');
select 'saved views I can see: ' || count(*) || ' (expect 1)' as views from pd.saved_views;
do $$ begin
  begin
    insert into pd.saved_views (name, params) values ('my OVERDUE sars', '{}');
    raise exception 'two views with the same name';
  exception when unique_violation then raise notice 'PASS a view name is used once per person';
  end;
  begin
    insert into pd.saved_views (user_id, name, params) values ('00000000-0000-0000-0000-00000000000b', 'For someone else', '{}');
    raise exception 'a view was saved for another person';
  exception when insufficient_privilege then raise notice 'PASS a view cannot be saved for someone else';
  end;
end $$;

-- Public form (0006): a submission, its one-time link, and the inbox item the link creates.
select 'form lookup ' || name || ' ' || colour || ' enabled ' || form_enabled || ' (expect Client A1 #1d5c86 enabled true)' as form from pd.form_lookup('aaa');
select case when count(*) = 0 then 'PASS an unknown code looks up nothing' else 'FAIL unknown code returned a client' end as form from pd.form_lookup('ZZZZ');
create temp table t_sub as
  select pd.form_submit('AAA', repeat('a', 64), 'Sam Example', 'SAM@example.com', 'sar', 'Please send me a copy of everything you hold about me.', null, 'schema-test-server-key-0123456789abcdef') as ref;
select 'submission ref ' || ref || ' (expect AAA-W0001)' as form from t_sub;
do $$ begin
  begin
    perform pd.form_submit('ZZZZ', repeat('b', 64), 'Sam', 'sam@example.com', 'sar', 'A long enough request text.', null, 'schema-test-server-key-0123456789abcdef');
    raise exception 'unknown code was accepted';
  exception when no_data_found then raise notice 'PASS a submission to an unknown code is refused';
  end;
  begin
    perform pd.form_submit('AAA', repeat('c', 64), 'Sam', 'sam@example.com', 'sar', 'short', null, 'schema-test-server-key-0123456789abcdef');
    raise exception 'short details were accepted';
  exception when check_violation then raise notice 'PASS details must be at least a sentence';
  end;
  begin
    perform pd.form_verify('AAA', repeat('f', 64), 'schema-test-server-key-0123456789abcdef');
    raise exception 'a wrong token was verified';
  exception when no_data_found then raise notice 'PASS a wrong token is refused';
  end;
  begin
    perform count(*) from pd.form_submissions;
    raise exception 'pending submissions were readable';
  exception when insufficient_privilege then raise notice 'PASS pending submissions cannot be read by users';
  end;
end $$;
-- Server key (0010): without it nobody can submit or verify, whatever token hash they pick.
do $$ begin
  begin
    perform pd.form_submit('AAA', repeat('d', 64), 'Mallory', 'victim@example.com', 'sar', 'Submitted straight to the database.', null, 'not-the-key');
    raise exception 'a submission without the server key was accepted';
  exception when insufficient_privilege then raise notice 'PASS a submission needs the server key';
  end;
  begin
    perform pd.form_verify('AAA', repeat('a', 64), 'not-the-key');
    raise exception 'a request was verified without the server key';
  exception when insufficient_privilege then raise notice 'PASS a request cannot be verified without the server key';
  end;
  begin
    perform pd.form_set_triage(repeat('a', 64), '{"by":"ai"}'::jsonb, null);
    raise exception 'triage was set without the server key';
  exception when insufficient_privilege then raise notice 'PASS triage cannot be set without the server key';
  end;
  begin
    perform pd.set_server_key('public_form', repeat('x', 40));
    raise exception 'a user replaced the server key';
  exception when insufficient_privilege then raise notice 'PASS a user cannot set the server key';
  end;
  begin
    perform count(*) from pd.server_keys;
    raise exception 'the server key table was readable';
  exception when insufficient_privilege then raise notice 'PASS a user cannot read the server key table';
  end;
end $$;
select 'still unverified after the refused attempts: ' || (count(*) = 0) || ' (expect true)' as form from pd.inbox_items where channel = 'form';

create temp table t_verified as select * from pd.form_verify('aaa', repeat('a', 64), 'schema-test-server-key-0123456789abcdef');
select 'verified ' || ref || ', received ' || received_on || ', type ' || request_type || ', already ' || already_verified
  || ' (expect AAA-W0001, today, sar, false)' as form from t_verified;
select 'item channel ' || channel || ', from ' || from_email || ', ref ' || source_ref || ', requested ' || requested_type
  || ' (expect form, sam@example.com, AAA-W0001, sar)' as form from pd.inbox_items where id = (select inbox_item_id from t_verified);
select 'second click: already ' || already_verified || ', same item ' || (inbox_item_id = (select inbox_item_id from t_verified))
  || ' (expect true, true)' as form from pd.form_verify('AAA', repeat('a', 64), 'schema-test-server-key-0123456789abcdef');
select 'form items ' || count(*) || ' (expect 1: the second click made nothing)' as form from pd.inbox_items where channel = 'form';
select pd.form_set_triage(repeat('a', 64), '{"by":"keywords","type":"sar","confidence":0.8,"summary":"Copy of data"}'::jsonb, 'schema-test-server-key-0123456789abcdef');
create temp table t_form_case as
  select pd.accept_inbox_item((select inbox_item_id from t_verified), 'sar', current_date, 'Sam Example', 'sam@example.com', 'Copy of data', false) as case_id;
select 'form case ' || ref || ', channel ' || channel || ', source ' || source_ref || ' (expect AAA-004, Web form, AAA-W0001)' as form
  from pd.cases where id = (select case_id from t_form_case);
select 'audit: ' || text as form from pd.case_events where case_id = (select case_id from t_form_case) and kind = 'triage';

-- London dates (0013). The session is put in a time zone whose date differs from London's
-- right now (twelve hours behind before noon, fourteen ahead after), and the rules must still
-- follow London: pd.today(), the "not in the future" check, and days left.
do $$
declare
  v_tz     text := current_setting('timezone');
  v_london date := (now() at time zone 'Europe/London')::date;
  v_ahead  boolean := extract(hour from now() at time zone 'Europe/London') >= 12;
begin
  perform set_config('timezone', case when v_ahead then 'Pacific/Kiritimati' else 'Etc/GMT+12' end, true);
  if current_date = v_london then
    raise exception 'test set-up: the session date should differ from London''s';
  end if;
  if pd.today() <> v_london then
    raise exception 'pd.today() followed the session time zone';
  end if;
  if v_ahead then
    -- The session thinks it is already tomorrow. A case received "tomorrow" must be refused.
    begin
      perform pd.create_case('aaaaaaaa-0000-0000-0000-000000000002', 'sar', current_date);
      raise exception 'a case received tomorrow, London time, was accepted';
    exception when check_violation then null;
    end;
  else
    -- The session thinks it is still yesterday. A case received today in London must be accepted.
    perform pd.create_case('aaaaaaaa-0000-0000-0000-000000000002', 'sar', v_london);
  end if;
  if exists (select 1 from pd.v_case_deadlines
             where status = 'open' and response_due is not null and days_left <> response_due - v_london) then
    raise exception 'days left were not counted from London''s date';
  end if;
  perform set_config('timezone', v_tz, true);
  raise notice 'PASS today is the date in London, whatever the session time zone';
end $$;
select 'PASS today is the date in London, whatever the session time zone' as dates;

-- Production checklist (0008): an admin without a second factor sees nothing; a sender address is capped.
select set_config('request.jwt.claim.aal', 'aal1', false);
select 'partner A admin at aal1 sees ' || count(*) || ' cases (expect 0)' as security from pd.cases;
select 'partner A admin at aal1 sees ' || count(*) || ' clients (expect 0)' as security from pd.organisations;
select set_config('request.jwt.claim.aal', 'aal2', false);
select 'partner A admin at aal2 sees ' || count(*) || ' cases again (expect more than 0)' as security from pd.cases;
do $$ begin
  for i in 1..10 loop
    perform pd.form_submit('AAB', lpad(to_hex(i), 64, '0'), 'Bot', 'bot' || i || '@example.com', 'sar', 'Automated submission number ' || i, repeat('9', 64), 'schema-test-server-key-0123456789abcdef');
  end loop;
  begin
    perform pd.form_submit('AAB', repeat('b', 64), 'Bot', 'bot99@example.com', 'sar', 'One too many from this address.', repeat('9', 64), 'schema-test-server-key-0123456789abcdef');
    raise exception 'the eleventh submission from one address was accepted';
  exception when program_limit_exceeded then raise notice 'PASS a sender address is capped at ten submissions an hour';
  end;
end $$;

-- Nightly job (0007): users may read the reminder log and the holidays, but only the service role runs the job.
select 'reminder log rows visible to partner A: ' || count(*) || ' (expect 0: nothing sent yet)' as nightly from pd.reminder_log;
do $$ begin
  begin
    perform count(*) from pd.reminders_due();
    raise exception 'a user ran reminders_due';
  exception when insufficient_privilege then raise notice 'PASS only the service role may list reminders due';
  end;
  begin
    perform pd.apply_retention();
    raise exception 'a user ran retention';
  exception when insufficient_privilege then raise notice 'PASS only the service role may run retention';
  end;
end $$;
select 'holidays readable: ' || count(*) || ' (expect more than 0)' as nightly from pd.bank_holidays where region = 'england-and-wales';

-- A read-only user can see but not act.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  begin
    perform pd.record_case_action('c0000000-0000-0000-0000-000000000008', 'note', current_date, 'hello');
    raise exception 'read-only action was allowed';
  exception when insufficient_privilege then raise notice 'PASS read-only user cannot act on a case';
  end;
  begin
    perform pd.decline_inbox_item((select id from pd.inbox_items where body like 'A message for%'), 'no');
    raise exception 'read-only decline was allowed';
  exception when insufficient_privilege then raise notice 'PASS read-only user cannot decide inbox items';
  end;
  begin
    perform pd.add_inbox_item('aaaaaaaa-0000-0000-0000-000000000002', 'A read-only user pastes a message');
    raise exception 'read-only paste was allowed';
  exception when insufficient_privilege then raise notice 'PASS read-only user cannot add inbox items';
  end;
end $$;
select 'partner B admin sees ' || count(*) || ' inbox items (expect 0)' as rls from pd.inbox_items
  where pd.current_user_id() = (select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false))::uuid;

-- Client organisations are separated the same way as cases.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select 'partner A admin sees ' || count(*) || ' clients (expect 3)' as rls from pd.organisations;
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

-- Retention reaches the inbox (0011). A case that came from the inbox goes with its item (this
-- delete used to fail on the item's check constraint), an old declined item goes too, and an
-- item still waiting for a person stays.
select organisation, month, received, complaints, sars, closed from pd.v_monthly_client_report order by organisation, month limit 5;
update pd.cases set status = 'closed', closed_on = '2020-01-01', received_on = '2019-12-01' where ref = 'AAA-003';
update pd.inbox_items set decided_at = now() - interval '10 years' where body like 'Spam%';
select 'retention deleted ' || pd.apply_retention() || ' row(s) (expect 2: the case and the declined item)' as retention;
select case when not exists (select 1 from pd.cases where ref = 'AAA-003') then 'PASS' else 'FAIL' end || ' retention removed a case that came from the inbox' as retention;
select case when not exists (select 1 from pd.inbox_items where from_email = 'pat@example.com') then 'PASS' else 'FAIL' end || ' the inbox item went with its case' as retention;
select case when not exists (select 1 from pd.inbox_items where body like 'Spam%') then 'PASS' else 'FAIL' end || ' an old declined item was removed' as retention;
select case when exists (select 1 from pd.inbox_items where body like 'A message for%' and status = 'new') then 'PASS' else 'FAIL' end || ' an item still waiting for a person was kept' as retention;
do $$ begin
  if exists (select 1 from pd.cases where ref = 'AAA-003') or exists (select 1 from pd.inbox_items where from_email = 'pat@example.com' or body like 'Spam%')
     or not exists (select 1 from pd.inbox_items where body like 'A message for%') then
    raise exception 'Inbox retention tests failed';
  end if;
end $$;

-- References are never reused (0014). The newest case and the newest form submission of a
-- client are deleted, as retention would, and the next ones must still get new numbers.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
create temp table t_ref1 as select pd.create_case('aaaaaaaa-0000-0000-0000-000000000002', 'sar', pd.today()) as id;
alter table t_ref1 add column ref text;
update t_ref1 set ref = (select ref from pd.cases where id = t_ref1.id);
delete from pd.cases where id = (select id from t_ref1);
create temp table t_ref2 as select pd.create_case('aaaaaaaa-0000-0000-0000-000000000002', 'sar', pd.today()) as id;
alter table t_ref2 add column ref text;
update t_ref2 set ref = (select ref from pd.cases where id = t_ref2.id);
select case when (select ref from t_ref2) > (select ref from t_ref1) then 'PASS' else 'FAIL' end
  || ' a deleted case reference is not reused: ' || (select ref from t_ref1) || ' then ' || (select ref from t_ref2) as refs;

create temp table t_wref1 as
  select pd.form_submit('AAA', repeat('1', 64), 'Ref Test', 'ref1@example.com', 'sar', 'A request that will be deleted.', null, 'schema-test-server-key-0123456789abcdef') as ref;
delete from pd.form_submissions where organisation_id = 'aaaaaaaa-0000-0000-0000-000000000001';
create temp table t_wref2 as
  select pd.form_submit('AAA', repeat('2', 64), 'Ref Test', 'ref2@example.com', 'sar', 'The request that comes after it.', null, 'schema-test-server-key-0123456789abcdef') as ref;
select case when (select ref from t_wref2) > (select ref from t_wref1) then 'PASS' else 'FAIL' end
  || ' a deleted web form reference is not reused: ' || (select ref from t_wref1) || ' then ' || (select ref from t_wref2) as refs;
do $$ begin
  if (select ref from t_ref2) is null or (select ref from t_ref1) is null
     or (select ref from t_ref2) <= (select ref from t_ref1) or (select ref from t_wref2) <= (select ref from t_wref1) then
    raise exception 'Reference reuse tests failed';
  end if;
end $$;

-- Extension window (0015), on the ICO's extension example: a request received on 7 August
-- 2025. The first month ends on Sunday 7 September, so Monday 8 September is the last day
-- the person can be told. A day later is refused; on the day is accepted, and the response
-- is then due on 7 November as in the ICO's example.
create temp table t_ext as select pd.create_case('aaaaaaaa-0000-0000-0000-000000000002', 'sar', '2025-08-07') as id;
select 'first month ends ' || response_due || ' (expect 2025-09-08: Sun 7 Sep moves to Mon 8 Sep)' as extension
  from pd.v_case_deadlines where case_id = (select id from t_ext);
do $$ begin
  begin
    perform pd.record_case_action((select id from t_ext), 'extend', '2025-09-09', 'Records at two sites');
    raise exception 'an extension after the first month was allowed';
  exception when check_violation then raise notice 'PASS an extension cannot be recorded after the first month';
  end;
end $$;
select pd.record_case_action((select id from t_ext), 'extend', '2025-09-08', 'Records at two sites');
select case when response_due = '2025-11-07' and clock_state = 'extended' then 'PASS' else 'FAIL' end
  || ' extended on the last day of the first month, now due ' || response_due || ' (expect 2025-11-07, ICO example)' as extension
  from pd.v_case_deadlines where case_id = (select id from t_ext);
do $$ begin
  if (select response_due from pd.v_case_deadlines where case_id = (select id from t_ext)) is distinct from '2025-11-07' then
    raise exception 'Extension window tests failed';
  end if;
end $$;

-- Reminder stages (0012): a case is reminded at the stage it has reached, so a missed night
-- is made up on the next run. -1 is overdue; nothing is due more than 7 days out.
select case when (select array_agg(pd.reminder_bucket(d) order by d) from unnest(array[-5, -1, 0, 1, 2, 3, 6, 7]) d)
                 = array[-1, -1, 0, 2, 2, 7, 7, 7]
             and pd.reminder_bucket(8) is null and pd.reminder_bucket(null) is null
            then 'PASS' else 'FAIL' end || ' reminder stages: overdue, today, within 2 days, within 7 days' as reminders;
do $$ begin
  if pd.reminder_bucket(6) is distinct from 7 or pd.reminder_bucket(1) is distinct from 2
     or pd.reminder_bucket(-1) is distinct from -1 or pd.reminder_bucket(8) is not null then
    raise exception 'Reminder stage tests failed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Two kinds of desk, and a team with levels of access (0022)
-- ---------------------------------------------------------------------------
reset role;
-- People as the sign-in system knows them. Una's address has not been confirmed.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'Olive.Owner@example.org', now()),
  ('00000000-0000-0000-0000-0000000000e2', 'hana.handler@example.org', now()),
  ('00000000-0000-0000-0000-0000000000e3', 'rae.reader@example.org', now()),
  ('00000000-0000-0000-0000-0000000000e4', 'ivo.intruder@example.net', now()),
  ('00000000-0000-0000-0000-0000000000e5', 'una.unconfirmed@example.org', null);
set role app_user;
select set_config('request.jwt.claim.aal', 'aal2', false);

-- An organisation sets up its own desk: the organisation itself is made with it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$
declare v_desk uuid; v_org pd.organisations%rowtype;
begin
  begin
    perform pd.create_workspace('Example Housing Trust', 'organisation');
    raise exception 'FAIL an organisation desk was made without a short code';
  exception when check_violation then raise notice 'PASS an organisation desk needs a short code';
  end;
  begin
    perform pd.create_workspace('Example Housing Trust', 'charity', 'EHT');
    raise exception 'FAIL an unknown kind of desk was allowed';
  exception when invalid_parameter_value then raise notice 'PASS only the two kinds of desk exist';
  end;
  begin
    perform pd.create_workspace('Example Housing Trust', 'organisation', 'aaa');
    raise exception 'FAIL a short code already in use was allowed';
  exception when unique_violation then raise notice 'PASS a short code cannot be used twice';
  end;

  v_desk := pd.create_workspace('  Example   Housing Trust ', 'organisation', 'eht', 'scotland');
  perform set_config('t.desk', v_desk::text, false);
  if (select kind from pd.partners where id = v_desk) <> 'organisation' then raise exception 'FAIL the desk is not an organisation desk'; end if;
  select * into v_org from pd.organisations where partner_id = v_desk;
  if v_org.name <> 'Example Housing Trust' or v_org.code <> 'EHT' or v_org.region <> 'scotland' then
    raise exception 'FAIL the organisation was not made with its desk: % % %', v_org.name, v_org.code, v_org.region;
  end if;
  if (select count(*) from pd.organisations where partner_id = v_desk) <> 1 then raise exception 'FAIL an organisation desk should have exactly one organisation'; end if;
  perform set_config('t.org', v_org.id::text, false);
  if not exists (select 1 from pd.members where partner_id = v_desk and role = 'partner_admin' and organisation_id is null and email = 'olive.owner@example.org') then
    raise exception 'FAIL the person who set the desk up is not its administrator, named by their address';
  end if;
  if (select count(*) from pd.team_events where partner_id = v_desk) <> 1 then raise exception 'FAIL setting up a desk was not logged'; end if;
  raise notice 'PASS an organisation desk is made with its one organisation, its administrator and a first log entry';
end $$;

-- Adding people: an administrator names an address and a level of access.
do $$
declare v_id uuid;
begin
  v_id := pd.invite_member('  Hana.Handler@Example.org ', 'client_user');
  perform set_config('t.inv_hana', v_id::text, false);
  perform set_config('t.inv_rae', pd.invite_member('rae.reader@example.org', 'read_only')::text, false);
  perform set_config('t.inv_una', pd.invite_member('una.unconfirmed@example.org', 'client_user')::text, false);
  if (select email from pd.invitations where id = v_id) <> 'hana.handler@example.org' then raise exception 'FAIL the address was not tidied'; end if;
  begin perform pd.invite_member('hana.handler@example.org', 'read_only'); raise exception 'FAIL the same person was added twice';
  exception when unique_violation then raise notice 'PASS a person cannot be added twice'; end;
  begin perform pd.invite_member('olive.owner@example.org', 'read_only'); raise exception 'FAIL someone already in the team was added again';
  exception when unique_violation then raise notice 'PASS someone already in the team cannot be added again'; end;
  begin perform pd.invite_member('not an address', 'read_only'); raise exception 'FAIL a bad address was accepted';
  exception when check_violation then raise notice 'PASS an address must look like one'; end;
  begin perform pd.invite_member('sam@example.org', 'owner'); raise exception 'FAIL an unknown level of access was accepted';
  exception when invalid_parameter_value then raise notice 'PASS only the three levels of access exist'; end;
end $$;

-- Only an administrator who has passed two-step sign-in may add people.
select set_config('request.jwt.claim.aal', 'aal1', false);
do $$ begin
  begin perform pd.invite_member('sam@example.org', 'read_only'); raise exception 'FAIL an administrator without two-step sign-in added someone';
  exception when insufficient_privilege then raise notice 'PASS adding people needs two-step sign-in'; end;
end $$;
select set_config('request.jwt.claim.aal', 'aal2', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  begin perform pd.invite_member('sam@example.org', 'read_only'); raise exception 'FAIL someone who is not an administrator added a person';
  exception when insufficient_privilege then raise notice 'PASS only an administrator can add people'; end;
end $$;

-- Joining: matched on the address the person has proved, and on nothing else.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e4', false);
do $$ begin
  if (select count(*) from pd.pending_invitations()) <> 0 then raise exception 'FAIL a stranger was shown an invitation'; end if;
  begin perform pd.accept_invitation(current_setting('t.inv_hana')::uuid); raise exception 'FAIL a stranger joined with an invitation for someone else';
  exception when no_data_found then raise notice 'PASS an invitation only works for the address it names'; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', false);
do $$ begin
  if (select count(*) from pd.pending_invitations()) <> 0 then raise exception 'FAIL an unconfirmed address was shown its invitation'; end if;
  begin perform pd.accept_invitation(current_setting('t.inv_una')::uuid); raise exception 'FAIL an unconfirmed address joined';
  exception when insufficient_privilege then raise notice 'PASS an address must be confirmed before it can join'; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
do $$
declare v pd.members%rowtype;
begin
  if not exists (select 1 from pd.pending_invitations() where desk = 'Example Housing Trust' and kind = 'organisation' and role = 'client_user') then
    raise exception 'FAIL the person added was not shown their invitation';
  end if;
  if pd.accept_invitation(current_setting('t.inv_hana')::uuid) <> current_setting('t.desk')::uuid then raise exception 'FAIL joining returned the wrong desk'; end if;
  select * into v from pd.members where user_id = '00000000-0000-0000-0000-0000000000e2';
  if v.role <> 'client_user' or v.organisation_id is not null or v.email <> 'hana.handler@example.org' or v.added_by <> '00000000-0000-0000-0000-0000000000e1' then
    raise exception 'FAIL the new member was not recorded as added';
  end if;
  if not pd.can_write_org(current_setting('t.org')::uuid) then raise exception 'FAIL a case handler cannot work on the cases of the organisation'; end if;
  begin perform pd.accept_invitation(current_setting('t.inv_rae')::uuid); raise exception 'FAIL someone joined twice';
  exception when unique_violation then raise notice 'PASS a person belongs to one desk'; end;
  -- A case handler sees their own membership and nothing of how the team is run.
  if (select count(*) from pd.members) <> 1 or (select count(*) from pd.invitations) <> 0 or (select count(*) from pd.team_events) <> 0 then
    raise exception 'FAIL a case handler can see how the team is run';
  end if;
  begin perform pd.invite_member('sam@example.org', 'read_only'); raise exception 'FAIL a case handler added someone';
  exception when insufficient_privilege then null; end;
  begin perform pd.set_member_role(v.id, 'partner_admin'); raise exception 'FAIL a case handler made themselves an administrator';
  exception when no_data_found then null; end;
  raise notice 'PASS a person added as a case handler joins on signing in, can work cases, and cannot run the team';
end $$;
-- Seeing the whole desk needs two-step sign-in, whatever the level of access.
select set_config('request.jwt.claim.aal', 'aal1', false);
select case when not pd.can_read_org(current_setting('t.org')::uuid) and not pd.can_write_org(current_setting('t.org')::uuid)
            then 'PASS' else 'FAIL' end || ' a case handler without two-step sign-in sees nothing' as team;
do $$ begin
  if pd.can_read_org(current_setting('t.org')::uuid) then raise exception 'Two-step sign-in test failed'; end if;
end $$;
select set_config('request.jwt.claim.aal', 'aal2', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', false);
do $$ begin
  perform pd.accept_invitation(current_setting('t.inv_rae')::uuid);
  if not pd.can_read_org(current_setting('t.org')::uuid) or pd.can_write_org(current_setting('t.org')::uuid) then
    raise exception 'FAIL read only is not read only';
  end if;
  raise notice 'PASS a person added as read only can read and not change';
end $$;

-- The administrator runs the team: changes access, withdraws an invitation, removes someone.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$
declare v_me uuid; v_hana uuid; v_rae uuid; v_log int;
begin
  select id into v_me from pd.members where user_id = '00000000-0000-0000-0000-0000000000e1';
  select id into v_hana from pd.members where user_id = '00000000-0000-0000-0000-0000000000e2';
  select id into v_rae from pd.members where user_id = '00000000-0000-0000-0000-0000000000e3';
  if (select count(*) from pd.members where partner_id = current_setting('t.desk')::uuid) <> 3 then raise exception 'FAIL the administrator does not see the whole team'; end if;

  begin perform pd.set_member_role(v_me, 'client_user'); raise exception 'FAIL the only administrator stepped down';
  exception when check_violation then raise notice 'PASS a desk keeps at least one administrator'; end;
  begin perform pd.remove_member(v_me); raise exception 'FAIL an administrator removed themselves';
  exception when check_violation then raise notice 'PASS nobody removes themselves'; end;

  select count(*) into v_log from pd.team_events;
  perform pd.set_member_role(v_rae, 'client_user');
  perform pd.set_member_role(v_rae, 'client_user');  -- no change, no entry
  perform pd.cancel_invitation(current_setting('t.inv_una')::uuid);
  perform pd.remove_member(v_hana);
  if (select role from pd.members where id = v_rae) <> 'client_user' then raise exception 'FAIL access was not changed'; end if;
  if exists (select 1 from pd.members where id = v_hana) or exists (select 1 from pd.invitations) then raise exception 'FAIL removing or withdrawing did not happen'; end if;
  if (select count(*) from pd.team_events) <> v_log + 3 then raise exception 'FAIL team changes were not each logged once'; end if;
  if not exists (select 1 from pd.team_events where text = 'Changed rae.reader@example.org from read only to a case handler' and actor_email = 'olive.owner@example.org') then
    raise exception 'FAIL the log does not say who changed what';
  end if;
  perform set_config('t.rae_member', v_rae::text, false);
  raise notice 'PASS the administrator changes access, withdraws an invitation and removes a person, each written to the log';

  -- Nothing about the team can be changed except through those functions.
  begin insert into pd.members (user_id, partner_id, role) values ('00000000-0000-0000-0000-0000000000e4', current_setting('t.desk')::uuid, 'partner_admin'); raise exception 'FAIL a member was inserted directly';
  exception when insufficient_privilege then null; end;
  begin update pd.members set role = 'partner_admin' where id = v_rae; raise exception 'FAIL a member was changed directly';
  exception when insufficient_privilege then null; end;
  begin delete from pd.members where id = v_rae; raise exception 'FAIL a member was deleted directly';
  exception when insufficient_privilege then null; end;
  begin insert into pd.invitations (partner_id, email, role, invited_by) values (current_setting('t.desk')::uuid, 'x@example.org', 'partner_admin', v_me); raise exception 'FAIL an invitation was inserted directly';
  exception when insufficient_privilege then null; end;
  begin delete from pd.team_events; raise exception 'FAIL the team log was deleted';
  exception when insufficient_privilege then null; end;
  begin perform pd.verified_email(); raise exception 'FAIL the address lookup can be called directly';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS members, invitations and the team log cannot be written directly';
end $$;

-- One desk's team is invisible to another desk's administrator.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select case when (select count(*) from pd.members where partner_id = current_setting('t.desk')::uuid) = 0
             and (select count(*) from pd.team_events where partner_id = current_setting('t.desk')::uuid) = 0
             and (select count(*) from pd.organisations where partner_id = current_setting('t.desk')::uuid) = 0
            then 'PASS' else 'FAIL' end || ' the administrator of another desk sees none of this team, its log or its organisation' as team;
do $$ begin
  if (select count(*) from pd.members where partner_id = current_setting('t.desk')::uuid) <> 0 then raise exception 'Team separation test failed'; end if;
  begin perform pd.remove_member(current_setting('t.rae_member')::uuid);
    raise exception 'FAIL the administrator of another desk removed a member';
  exception when no_data_found then raise notice 'PASS the administrator of another desk cannot touch this team'; end;
end $$;
reset role;

-- The log cannot be edited, even by an ordinary statement run as the owner.
do $$ begin
  begin update pd.team_events set text = 'rewritten'; raise exception 'FAIL the team log was edited';
  exception when raise_exception then raise notice 'PASS the team log cannot be edited'; end;
end $$;
-- Desks made the old way are consultancies, as every desk was before.
select case when (select kind from pd.partners where name = 'Partner D') = 'consultancy' and (select kind from pd.partners where name = 'Partner A') = 'consultancy'
            then 'PASS' else 'FAIL' end || ' existing desks, and ones made by the old function, are consultancies' as team;
do $$ begin
  if (select kind from pd.partners where name = 'Partner D') <> 'consultancy' then raise exception 'Desk kind test failed'; end if;
end $$;
