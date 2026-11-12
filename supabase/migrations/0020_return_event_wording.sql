-- Privacy Desk: wording of the audit entry when a case is returned to the inbox.
--
-- 0019 wrote the person's reason in the middle of the sentence, so a reason without a full
-- stop ran straight into the next sentence ("...checking the flow This case is closed..."). The
-- entry is a permanent record, so the fixed wording now comes first and the reason last.
-- Nothing else about the function changes; entries already written stay as they are, because
-- the audit trail is never edited.

create or replace function pd.return_case_to_inbox(p_case_id uuid, p_reason text) returns uuid
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
    'Returned to the inbox so the message can be triaged and decided again. This case is closed, keeps its reference, '
      || 'and is not counted in the on-time figures. Why: ' || v_reason,
    pd.current_user_id());

  perform set_config('pd.undo_reason', v_reason, true);
  update pd.inbox_items
     set status = 'new', case_id = null, decided_by = null, decided_at = null
   where id = it.id;
  return it.id;
end $$;
