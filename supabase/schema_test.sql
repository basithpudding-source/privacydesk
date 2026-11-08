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
reset role;

select organisation, month, received, complaints, sars, closed from pd.v_monthly_client_report order by organisation, month limit 5;
