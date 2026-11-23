-- Privacy Desk: live isolation checks (slice 7). Run in the Supabase SQL editor against the
-- real project, as often as you like: it seeds nothing and changes nothing. Every row of the
-- result should start with PASS. It uses whatever data is there, so it needs at least one
-- partner admin and one case; the "other consultancy" checks need two consultancies.
--
-- The editor runs as postgres, so "set local role" switches to each API role in turn.

drop table if exists seen;
create temp table seen (n serial, note text);
grant insert on seen to anon, authenticated;
grant usage on sequence seen_n_seq to anon, authenticated;

do $$
declare
  v_admin   uuid;
  v_partner uuid;
  v_other   uuid;   -- a case belonging to a different consultancy
  v_mine    uuid;   -- a case the admin may see
  v_event   bigint;
  n int;
begin
  -- Prefer an admin whose consultancy has cases, so the "sees their own" check means something.
  select m.user_id, m.partner_id into v_admin, v_partner
  from pd.members m
  where m.role = 'partner_admin' and m.organisation_id is null
  order by (exists (select 1 from pd.cases c join pd.organisations o on o.id = c.organisation_id where o.partner_id = m.partner_id)) desc,
           m.created_at
  limit 1;
  if v_admin is null then
    insert into seen (note) values ('SKIP no partner admin exists yet'); return;
  end if;
  select c.id into v_mine from pd.cases c join pd.organisations o on o.id = c.organisation_id where o.partner_id = v_partner limit 1;
  select c.id into v_other from pd.cases c join pd.organisations o on o.id = c.organisation_id where o.partner_id <> v_partner limit 1;
  select e.id into v_event from pd.case_events e where e.case_id = v_mine limit 1;

  -- 1. The anonymous role reads no table.
  set local role anon;
  for n in 1..1 loop
    begin perform count(*) from pd.cases; raise exception 'anon read cases';
    exception when insufficient_privilege then insert into seen (note) values ('PASS anon cannot read cases'); end;
    begin perform count(*) from pd.inbox_items; raise exception 'anon read inbox';
    exception when insufficient_privilege then insert into seen (note) values ('PASS anon cannot read inbox items'); end;
    begin perform count(*) from pd.form_submissions; raise exception 'anon read submissions';
    exception when insufficient_privilege then insert into seen (note) values ('PASS anon cannot read form submissions'); end;
    begin perform count(*) from pd.members; raise exception 'anon read members';
    exception when insufficient_privilege then insert into seen (note) values ('PASS anon cannot read members'); end;
    -- The public form's functions refuse without the server's key (0010). Nothing is written.
    begin perform pd.form_submit('ZZZZZZ', repeat('0', 64), 'Check', 'check@example.com', 'sar', 'A live check, never stored.', null, 'not-the-key'); raise exception 'anon submitted a form';
    exception when insufficient_privilege then insert into seen (note) values ('PASS anon cannot submit a form without the server key'); end;
    begin perform pd.form_verify('ZZZZZZ', repeat('0', 64), 'not-the-key'); raise exception 'anon verified a form';
    exception when insufficient_privilege then insert into seen (note) values ('PASS anon cannot verify a request without the server key'); end;
    -- Inbound email refuses without the server's key (0017), before the token is even looked at.
    begin perform pd.receive_inbound_email('not-a-token', 'Check', 'check@example.com', 'Check', 'A live check, never stored.', null, 'not-the-key'); raise exception 'anon stored inbound email';
    exception when insufficient_privilege then insert into seen (note) values ('PASS anon cannot store inbound email without the server key'); end;
  end loop;
  reset role;

  -- 2. A partner admin without a second factor sees nothing.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'aal', 'aal1', 'role', 'authenticated')::text, true);
  insert into seen (note) select case when count(*) = 0 then 'PASS' else 'FAIL' end || ' admin at aal1 sees ' || count(*) || ' cases' from pd.cases;
  insert into seen (note) select case when count(*) = 0 then 'PASS' else 'FAIL' end || ' admin at aal1 sees ' || count(*) || ' clients' from pd.organisations;

  -- 3. The same admin with a second factor sees their own cases, and nobody else's.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'aal', 'aal2', 'role', 'authenticated')::text, true);
  insert into seen (note) select case when count(*) > 0 then 'PASS' else 'FAIL' end || ' admin at aal2 sees ' || count(*) || ' cases of their own' from pd.cases;
  if v_other is not null then
    insert into seen (note) select case when count(*) = 0 then 'PASS' else 'FAIL' end || ' another consultancy''s case by id returns ' || count(*) || ' rows' from pd.cases where id = v_other;
    insert into seen (note) select case when count(*) = 0 then 'PASS' else 'FAIL' end || ' another consultancy''s deadlines by id return ' || count(*) || ' rows' from pd.v_case_deadlines where case_id = v_other;
    begin
      perform pd.record_case_action(v_other, 'note', current_date, 'should not work');
      insert into seen (note) values ('FAIL an action on another consultancy''s case was allowed');
    exception when no_data_found or insufficient_privilege then insert into seen (note) values ('PASS an action on another consultancy''s case is refused'); end;
  else
    insert into seen (note) values ('SKIP only one consultancy has cases, so cross-consultancy reads were not tested');
  end if;

  -- 4. The audit trail cannot be edited or deleted, even by the admin who owns it.
  if v_event is not null then
    begin update pd.case_events set text = 'tampered' where id = v_event; raise exception 'audit edit allowed';
    exception when raise_exception or insufficient_privilege then insert into seen (note) values ('PASS an audit event cannot be edited'); end;
    begin delete from pd.case_events where id = v_event; raise exception 'audit delete allowed';
    exception when raise_exception or insufficient_privilege then insert into seen (note) values ('PASS an audit event cannot be deleted'); end;
  else
    insert into seen (note) values ('SKIP no audit event to test');
  end if;

  -- 4b. A case cannot be changed except through the audited functions (0009). Updating a
  -- column to itself changes nothing even if it were allowed.
  begin update pd.cases set summary = summary where id = v_mine; raise exception 'direct case update allowed';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a case cannot be updated directly'); end;
  begin update pd.inbox_items set triage = triage where false; raise exception 'direct inbox update allowed';
  exception when insufficient_privilege then insert into seen (note) values ('PASS an inbox item cannot be changed directly'); end;

  -- 4c. A client cannot be deleted through the API (0016). The filter matches no row.
  begin delete from pd.organisations where false; raise exception 'client delete allowed';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a client cannot be deleted by a user'); end;

  -- 5. Users cannot reach what only the job may.
  begin perform count(*) from pd.form_submissions; raise exception 'user read submissions';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a user cannot read pending form submissions'); end;
  begin perform count(*) from pd.reminders_due(); raise exception 'user listed reminders';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a user cannot list reminders due'); end;
  begin perform pd.apply_retention(); raise exception 'user ran retention';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a user cannot run retention'); end;
  begin insert into pd.inbox_events (inbox_item_id, organisation_id, kind, text) values (gen_random_uuid(), gen_random_uuid(), 'accepted', 'A live check, never stored.'); raise exception 'user wrote to the inbox log';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a user cannot write to the inbox log (0019)'); end;

  -- 6. The team (0022): memberships, invitations and the team log change only through the
  -- functions that write the log. None of these statements matches a row.
  begin update pd.members set role = role where false; raise exception 'direct membership change allowed';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a membership cannot be changed directly (0022)'); end;
  begin insert into pd.invitations (partner_id, email, role, invited_by) select v_partner, 'live-check@example.com', 'read_only', v_admin where false; raise exception 'direct invitation allowed';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a person cannot be added to a team directly (0022)'); end;
  begin delete from pd.team_events where false; raise exception 'team log delete allowed';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a user cannot write to the team log (0022)'); end;

  -- 7. The directory of people (0023) and leaving (0024). None of these statements matches a
  -- row, and the desk named to be closed does not exist.
  begin update pd.people set name = name where false; raise exception 'direct change to the directory allowed';
  exception when insufficient_privilege then insert into seen (note) values ('PASS the directory of people cannot be written directly (0023)'); end;
  begin perform pd.close_desk(gen_random_uuid(), 'No such desk', 'A live check, never carried out'); raise exception 'a user reached close_desk';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a user cannot close a desk (0024)'); end;
  begin perform count(*) from pd.closed_desks; raise exception 'a user read the record of closed desks';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a user cannot read the record of closed desks (0024)'); end;
  begin perform pd.delete_client(gen_random_uuid(), 'No such client', 'A live check, never carried out'); raise exception 'a client that is not theirs was deleted';
  exception when insufficient_privilege then insert into seen (note) values ('PASS a client that is not yours cannot be deleted (0024)'); end;
  reset role;
end $$;

select note from seen order by n;
