-- Privacy Desk: an extension must be told to the person within the first month.
--
-- A request can be extended by two further months when it is complex, but only if the
-- organisation tells the person, with the reason, within one month of receiving the request
-- (ICO guidance, "Can we extend the time for a response?"; UK GDPR Article 12(3)). The extend
-- action accepted any date, so a case that was already late could be "extended" after the
-- event and shown as on time. It now refuses a date after the first month's deadline as the
-- clock stands: the original due date, moved on by any days the clock was stopped and to the
-- next working day, exactly as pd.request_due works it out. A late case stays visibly late.
--
-- The function is otherwise as in 0009. (The time zone setting is restated because replacing
-- a function drops the one added in 0013.)

create or replace function pd.record_case_action(
  p_case_id uuid,
  p_action  text,
  p_on      date default current_date,
  p_note    text default null,
  p_outcome text default null
) returns void
language plpgsql security definer set search_path = pd, pg_temp set timezone = 'Europe/London' as $$
declare
  c          pd.cases%rowtype;
  v_uid      uuid := pd.current_user_id();
  v_on       date := coalesce(p_on, current_date);
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_outcome  text := nullif(trim(coalesce(p_outcome, '')), '');
  v_pause    pd.clock_pauses%rowtype;
  v_text     text;
  v_when     text;
  v_due      date;
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
      -- The person must be told within the first month. v_due is that month's last day as the
      -- clock stands (it is null while the clock is stopped or has not started, and then
      -- there is nothing to be late for yet).
      v_due := pd.request_due(c.id);
      if v_due is not null and v_on > v_due then
        raise exception 'Too late to extend: the person had to be told by %, the end of the first month', to_char(v_due, 'FMDD Mon YYYY')
          using errcode = 'check_violation';
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
