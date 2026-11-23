-- Privacy Desk: the team log says "1 case", not "1 cases".
--
-- The two entries written when a client leaves (0024) built their wording from counts and
-- always used the plural: "1 cases (1 still open) and 1 inbox messages". They now read
-- "1 case (1 still open) and 1 inbox message". Nothing else about the two functions changes:
-- who may call them, what they check and what they delete are word for word as in 0024.
--
-- Entries already on the team log keep the wording they were written with. The team log is
-- never edited, and that includes tidying it.

-- A count with its noun: "0 cases", "1 case", "2 cases".
create function pd.counted(p_n bigint, p_one text, p_many text) returns text
language sql immutable set search_path = pd, pg_temp as $$
  select p_n || ' ' || case when p_n = 1 then p_one else p_many end
$$;
-- Only the functions below use it, and they run as the owner.
revoke execute on function pd.counted(bigint, text, text) from public, anon, authenticated;

create or replace function pd.note_export(p_org uuid) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  o pd.organisations%rowtype;
begin
  select * into o from pd.organisations where id = p_org;
  if not found or not pd.is_partner_admin(o.partner_id) then
    -- The same answer whether it is missing or someone else's.
    raise exception 'Only an administrator can export this' using errcode = 'insufficient_privilege';
  end if;
  insert into pd.team_events (partner_id, actor, actor_email, text)
  values (o.partner_id, pd.current_user_id(), pd.verified_email(),
          'Downloaded an export of ' || o.name || ' (' || o.code || '): '
          || pd.counted((select count(*) from pd.cases c where c.organisation_id = o.id), 'case', 'cases') || ' and '
          || pd.counted((select count(*) from pd.inbox_items i where i.organisation_id = o.id), 'inbox message', 'inbox messages'));
end $$;

create or replace function pd.delete_client(p_org uuid, p_name text, p_reason text) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  o        pd.organisations%rowtype;
  v_kind   text;
  v_reason text := trim(regexp_replace(coalesce(p_reason, ''), '[[:space:]]+', ' ', 'g'));
  v_cases  bigint;
  v_open   bigint;
  v_inbox  bigint;
begin
  select * into o from pd.organisations where id = p_org for update;
  if not found or not pd.is_partner_admin(o.partner_id) then
    raise exception 'Only an administrator can delete a client' using errcode = 'insufficient_privilege';
  end if;
  select kind into v_kind from pd.partners where id = o.partner_id;
  if v_kind = 'organisation' then
    raise exception 'An organisation''s own desk cannot delete its organisation. Ask for the desk to be closed instead' using errcode = 'check_violation', hint = 'own';
  end if;
  -- Typed exactly, so the wrong client cannot be deleted by a slip.
  if p_name is null or trim(p_name) <> o.name then
    raise exception 'The name typed does not match the client''s name' using errcode = 'check_violation', hint = 'name';
  end if;
  if length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Say who asked for this and why, in 5 to 500 characters' using errcode = 'check_violation', hint = 'reason';
  end if;

  select count(*), count(*) filter (where status = 'open') into v_cases, v_open from pd.cases where organisation_id = o.id;
  select count(*) into v_inbox from pd.inbox_items where organisation_id = o.id;

  -- The record is written first and stays: the team log does not go with the client.
  insert into pd.team_events (partner_id, actor, actor_email, text)
  values (o.partner_id, pd.current_user_id(), pd.verified_email(),
          'Deleted the client ' || o.name || ' (' || o.code || ') and everything held for it: '
          || pd.counted(v_cases, 'case', 'cases') || ' (' || v_open || ' still open) and '
          || pd.counted(v_inbox, 'inbox message', 'inbox messages') || '. Why: ' || v_reason);

  -- Cases, their audit trails and pauses, inbox messages and their logs, pending form
  -- submissions, reference counters and any membership limited to this client all go with it.
  delete from pd.organisations where id = o.id;
end $$;
