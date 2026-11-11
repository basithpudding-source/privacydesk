-- Privacy Desk: the audited functions become the only way to change a case.
--
-- Until now the signed-in role could insert and update pd.cases, pd.clock_pauses,
-- pd.case_events and pd.inbox_items directly, because the functions ran as the caller and
-- needed those grants. Anyone with write access could therefore change a received date
-- through the Data API with no audit event, or add an event of their own wording.
--
-- The functions now run with definer rights and check the caller's membership themselves;
-- the signed-in role keeps only select on those four tables. "Every change to a case writes
-- an audit event" is then a rule the database enforces, not a habit of the app.

-- ---------------------------------------------------------------------------
-- Create a case (as 0004, now with definer rights).
-- ---------------------------------------------------------------------------
create or replace function pd.create_case(
  p_organisation_id uuid,
  p_type            text,
  p_received_on     date,
  p_channel         text    default 'Email',
  p_requester_name  text    default null,
  p_requester_email text    default null,
  p_summary         text    default null,
  p_message         text    default null,
  p_id_required     boolean default false
) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  v_code text;
  v_n    int;
  v_ref  text;
  v_id   uuid;
  v_uid  uuid := pd.current_user_id();
begin
  if v_uid is null or not pd.can_write_org(p_organisation_id) then
    raise exception 'You cannot add cases for this client' using errcode = 'insufficient_privilege';
  end if;
  if p_received_on is null or p_received_on > current_date then
    raise exception 'Enter the date the request was received; it cannot be in the future' using errcode = 'check_violation';
  end if;
  if p_id_required and p_type = 'complaint' then
    raise exception 'Complaints do not need proof of identity' using errcode = 'check_violation';
  end if;

  select code into v_code from pd.organisations where id = p_organisation_id;

  -- One case at a time per client, so two people logging at once cannot take the same number.
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text));
  select coalesce(max(substring(ref from '[0-9]+$')::int), 0) + 1 into v_n
  from pd.cases where organisation_id = p_organisation_id and ref like v_code || '-%';
  loop
    v_ref := v_code || '-' || lpad(v_n::text, 3, '0');
    exit when not exists (select 1 from pd.cases where ref = v_ref);
    v_n := v_n + 1;
  end loop;

  insert into pd.cases (organisation_id, ref, type, channel, requester_name, requester_email,
                        received_on, summary, message, id_required)
  values (p_organisation_id, v_ref, p_type, coalesce(nullif(trim(p_channel), ''), 'Email'),
          nullif(trim(p_requester_name), ''), nullif(lower(trim(p_requester_email)), ''),
          p_received_on, nullif(trim(p_summary), ''), nullif(trim(p_message), ''), p_id_required)
  returning id into v_id;

  insert into pd.case_events (case_id, kind, text, actor) values (
    v_id, 'created',
    'Case logged by hand (' || coalesce(nullif(trim(p_channel), ''), 'Email') || '), received '
      || to_char(p_received_on, 'FMDD Mon YYYY')
      || case when p_id_required then '. Proof of identity needed before the clock starts' else '' end,
    v_uid);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Apply one action to a case (as 0004, now with definer rights). Row-level security no
-- longer hides other people's cases from this function, so it checks reading first: a case
-- the caller may not see is reported as not there, exactly as before.
-- ---------------------------------------------------------------------------
create or replace function pd.record_case_action(
  p_case_id uuid,
  p_action  text,
  p_on      date default current_date,
  p_note    text default null,
  p_outcome text default null
) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  c          pd.cases%rowtype;
  v_uid      uuid := pd.current_user_id();
  v_on       date := coalesce(p_on, current_date);
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_outcome  text := nullif(trim(coalesce(p_outcome, '')), '');
  v_pause    pd.clock_pauses%rowtype;
  v_text     text;
  v_when     text;
begin
  -- Lock the row while reading it, so two actions at once cannot both act on the old state.
  select * into c from pd.cases where id = p_case_id for update;
  if not found or v_uid is null or not pd.can_read_org(c.organisation_id) then
    raise exception 'That case is not here' using errcode = 'no_data_found';
  end if;
  if not pd.can_write_org(c.organisation_id) then
    raise exception 'You cannot change this case' using errcode = 'insufficient_privilege';
  end if;
  if v_on > current_date then
    raise exception 'The date cannot be in the future' using errcode = 'check_violation';
  end if;
  if v_on < c.received_on then
    raise exception 'The date cannot be before the case was received' using errcode = 'check_violation';
  end if;
  if c.status = 'closed' and p_action not in ('reopen', 'note') then
    raise exception 'The case is closed. Reopen it first' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_pause from pd.clock_pauses where case_id = c.id and resumed_on is null;
  v_when := to_char(v_on, 'FMDD Mon YYYY');

  case p_action
    when 'acknowledge' then
      if c.acknowledged_on is not null then
        raise exception 'Already acknowledged on %', to_char(c.acknowledged_on, 'FMDD Mon YYYY') using errcode = 'invalid_parameter_value';
      end if;
      update pd.cases set acknowledged_on = v_on where id = c.id;
      v_text := 'Acknowledgement sent on ' || v_when;

    when 'ask_id' then
      if c.type = 'complaint' then
        raise exception 'Complaints do not need proof of identity' using errcode = 'invalid_parameter_value';
      end if;
      if c.id_required then
        raise exception 'Proof of identity has already been asked for' using errcode = 'invalid_parameter_value';
      end if;
      if v_pause.id is not null then
        raise exception 'Clarification is outstanding; deal with that first' using errcode = 'invalid_parameter_value';
      end if;
      update pd.cases set id_required = true where id = c.id;
      v_text := 'Asked for proof of identity on ' || v_when || '; the clock waits until it arrives';

    when 'id_received' then
      if not c.id_required or c.id_received_on is not null then
        raise exception 'No proof of identity is outstanding' using errcode = 'invalid_parameter_value';
      end if;
      update pd.cases set id_received_on = v_on where id = c.id;
      v_text := 'Proof of identity received on ' || v_when || '; the clock started';

    when 'pause' then
      if c.type = 'complaint' then
        raise exception 'Only requests have a clock to stop' using errcode = 'invalid_parameter_value';
      end if;
      if c.id_required and c.id_received_on is null then
        raise exception 'The clock has not started: proof of identity is still outstanding' using errcode = 'invalid_parameter_value';
      end if;
      if v_pause.id is not null then
        raise exception 'Clarification was already requested on %', to_char(v_pause.paused_on, 'FMDD Mon YYYY') using errcode = 'invalid_parameter_value';
      end if;
      if v_note is null then
        raise exception 'Say what you asked the person to clarify' using errcode = 'check_violation';
      end if;
      insert into pd.clock_pauses (case_id, paused_on, note) values (c.id, v_on, v_note);
      v_text := 'Clarification requested on ' || v_when || '; clock stopped: ' || v_note;

    when 'resume' then
      if v_pause.id is null then
        raise exception 'No clarification is outstanding' using errcode = 'invalid_parameter_value';
      end if;
      if v_on < v_pause.paused_on then
        raise exception 'The date cannot be before the clarification was requested' using errcode = 'check_violation';
      end if;
      update pd.clock_pauses set resumed_on = v_on where id = v_pause.id;
      v_text := 'Clarification received on ' || v_when || '; clock restarted'
        || coalesce(': ' || v_note, '');

    when 'extend' then
      if c.type = 'complaint' then
        raise exception 'Complaints cannot be extended' using errcode = 'invalid_parameter_value';
      end if;
      if c.extended then
        raise exception 'Already extended on %', to_char(c.extended_on, 'FMDD Mon YYYY') using errcode = 'invalid_parameter_value';
      end if;
      if v_note is null then
        raise exception 'Say why the request is complex; the person must be told the reason' using errcode = 'check_violation';
      end if;
      update pd.cases set extended = true, extended_on = v_on where id = c.id;
      v_text := 'Extended to three months; person told on ' || v_when || '. Reason: ' || v_note;

    when 'note' then
      if v_note is null then
        raise exception 'Write the note first' using errcode = 'check_violation';
      end if;
      v_text := v_note;

    when 'close' then
      if c.type = 'complaint' then
        if v_outcome is null then
          raise exception 'Record the outcome of the complaint' using errcode = 'check_violation';
        end if;
        v_text := 'Closed on ' || v_when || ' with outcome: ' || v_outcome;
      else
        v_outcome := coalesce(v_outcome, 'Response sent');
        v_text := 'Closed: response sent on ' || v_when || coalesce('. ' || v_note, '');
      end if;
      update pd.cases set status = 'closed', closed_on = v_on, outcome = v_outcome where id = c.id;

    when 'reopen' then
      if c.status <> 'closed' then
        raise exception 'The case is already open' using errcode = 'invalid_parameter_value';
      end if;
      update pd.cases set status = 'open', closed_on = null, outcome = null where id = c.id;
      v_text := 'Reopened on ' || v_when || coalesce(': ' || v_note, '');

    else
      raise exception 'Unknown action %', p_action using errcode = 'invalid_parameter_value';
  end case;

  update pd.cases set updated_at = now() where id = c.id;
  insert into pd.case_events (case_id, kind, text, actor) values (c.id, p_action, v_text, v_uid);
end $$;

-- ---------------------------------------------------------------------------
-- Inbox: accept and decline (as 0006 and 0005, now with definer rights and a row lock so
-- two people cannot both accept the same item).
-- ---------------------------------------------------------------------------
create or replace function pd.accept_inbox_item(
  p_item_id         uuid,
  p_type            text,
  p_received_on     date,
  p_requester_name  text    default null,
  p_requester_email text    default null,
  p_summary         text    default null,
  p_id_required     boolean default false
) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  it       pd.inbox_items%rowtype;
  v_case   uuid;
  v_uid    uuid := pd.current_user_id();
  v_by     text;
  v_conf   numeric;
  v_lead   text;
begin
  select * into it from pd.inbox_items where id = p_item_id for update;
  if not found or v_uid is null or not pd.can_read_org(it.organisation_id) then
    raise exception 'That inbox item is not here' using errcode = 'no_data_found';
  end if;
  if not pd.can_write_org(it.organisation_id) then
    raise exception 'You cannot accept items for this client' using errcode = 'insufficient_privilege';
  end if;
  if it.status <> 'new' then
    raise exception 'This item was already % ', it.status using errcode = 'invalid_parameter_value';
  end if;

  v_case := pd.create_case(
    it.organisation_id, p_type, p_received_on,
    case it.channel when 'email' then 'Email' when 'form' then 'Web form' else 'Email' end,
    p_requester_name, p_requester_email, p_summary, it.body, p_id_required);

  v_by   := coalesce(it.triage ->> 'by', 'nobody');
  v_conf := nullif(it.triage ->> 'confidence', '')::numeric;
  v_lead := case when it.channel = 'form'
                 then 'Accepted from the inbox (web form ' || coalesce(it.source_ref, '?') || ', email address verified). '
                 else 'Accepted from the inbox. ' end;
  update pd.cases set triage = it.triage, source_ref = it.source_ref where id = v_case;
  insert into pd.case_events (case_id, kind, text, actor) values (
    v_case, 'triage',
    v_lead || case
      when v_by = 'ai' then 'AI triage proposed ' || coalesce(it.triage ->> 'type', '?')
        || ' (' || coalesce(round(v_conf * 100)::text, '?') || '% confident); a person confirmed ' || p_type
      when v_by = 'keywords' then 'Keyword check suggested ' || coalesce(it.triage ->> 'type', '?')
        || '; a person confirmed ' || p_type
      else 'No triage; a person chose ' || p_type
    end,
    v_uid);

  update pd.inbox_items
     set status = 'accepted', case_id = v_case, decided_by = v_uid, decided_at = now()
   where id = it.id;
  return v_case;
end $$;

create or replace function pd.decline_inbox_item(p_item_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  it    pd.inbox_items%rowtype;
  v_uid uuid := pd.current_user_id();
begin
  select * into it from pd.inbox_items where id = p_item_id for update;
  if not found or v_uid is null or not pd.can_read_org(it.organisation_id) then
    raise exception 'That inbox item is not here' using errcode = 'no_data_found';
  end if;
  if not pd.can_write_org(it.organisation_id) then
    raise exception 'You cannot decline items for this client' using errcode = 'insufficient_privilege';
  end if;
  if it.status <> 'new' then
    raise exception 'This item was already %', it.status using errcode = 'invalid_parameter_value';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why it is being declined' using errcode = 'check_violation';
  end if;
  update pd.inbox_items
     set status = 'declined', decline_reason = trim(p_reason), decided_by = v_uid, decided_at = now()
   where id = it.id;
end $$;

-- ---------------------------------------------------------------------------
-- The two inbox writes the app used to make directly: pasting a message in by hand, and
-- storing a fresh triage proposal on an item that is still new.
-- ---------------------------------------------------------------------------
create function pd.add_inbox_item(
  p_organisation_id uuid,
  p_body            text,
  p_from_name       text  default null,
  p_from_email      text  default null,
  p_subject         text  default null,
  p_triage          jsonb default null
) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  v_id   uuid;
  v_body text := trim(coalesce(p_body, ''));
begin
  if pd.current_user_id() is null or not pd.can_write_org(p_organisation_id) then
    raise exception 'You cannot add inbox items for this client' using errcode = 'insufficient_privilege';
  end if;
  if length(v_body) < 10 or length(v_body) > 50000 then
    raise exception 'Paste the message: at least a sentence, at most 50,000 characters' using errcode = 'check_violation';
  end if;
  insert into pd.inbox_items (organisation_id, channel, from_name, from_email, subject, body, triage)
  values (p_organisation_id, 'paste', nullif(trim(p_from_name), ''), nullif(lower(trim(p_from_email)), ''),
          nullif(trim(p_subject), ''), v_body, p_triage)
  returning id into v_id;
  return v_id;
end $$;

create function pd.retriage_inbox_item(p_item_id uuid, p_triage jsonb) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  it pd.inbox_items%rowtype;
begin
  select * into it from pd.inbox_items where id = p_item_id for update;
  if not found or pd.current_user_id() is null or not pd.can_read_org(it.organisation_id) then
    raise exception 'That inbox item is not here' using errcode = 'no_data_found';
  end if;
  if not pd.can_write_org(it.organisation_id) then
    raise exception 'You cannot change items for this client' using errcode = 'insufficient_privilege';
  end if;
  if it.status <> 'new' then
    raise exception 'This item was already %', it.status using errcode = 'invalid_parameter_value';
  end if;
  update pd.inbox_items set triage = p_triage where id = it.id;
end $$;

revoke execute on function pd.add_inbox_item(uuid, text, text, text, text, jsonb) from public, anon;
revoke execute on function pd.retriage_inbox_item(uuid, jsonb) from public, anon;
grant execute on function pd.add_inbox_item(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function pd.retriage_inbox_item(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Take the direct write access away. Reading is unchanged: the select policies stay.
-- ---------------------------------------------------------------------------
drop policy cases_insert on pd.cases;
drop policy cases_update on pd.cases;
drop policy pauses_write on pd.clock_pauses;
drop policy events_add   on pd.case_events;
drop policy inbox_insert on pd.inbox_items;
drop policy inbox_update on pd.inbox_items;

revoke insert, update, delete on pd.cases, pd.clock_pauses, pd.case_events, pd.inbox_items from authenticated;
