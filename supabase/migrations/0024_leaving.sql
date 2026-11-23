-- Privacy Desk: when a client, or a whole desk, leaves.
--
-- A consultancy that stops acting for a client must hand the client's data back or delete it,
-- as the client chooses, and be able to show that it did. Until now only the database owner
-- could remove a client (0016), and nothing recorded that an export had been taken. This adds:
--
--   1. pd.note_export: writes to the team log that an administrator downloaded a client's
--      data (the download itself is made by the app from what the administrator can read).
--   2. pd.delete_client: an administrator deletes one client and everything held for it. The
--      client's name must be typed, and who asked and why must be given. The team log keeps
--      that it happened, by whom, and how much was deleted. It cannot be undone.
--   3. pd.close_desk: removes a whole desk. Not for anyone signed in to the app: it is run by
--      whoever operates Privacy Desk, from the SQL editor, when a customer leaves. A row in
--      pd.closed_desks records that it happened, with counts and no personal data.
--
-- An organisation's own desk has one organisation, which cannot be deleted from inside the
-- desk: closing the desk is the way out.

-- ---------------------------------------------------------------------------
-- 1. An export was taken
-- ---------------------------------------------------------------------------
create function pd.note_export(p_org uuid) returns void
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
          || (select count(*) from pd.cases c where c.organisation_id = o.id) || ' cases and '
          || (select count(*) from pd.inbox_items i where i.organisation_id = o.id) || ' inbox messages');
end $$;
revoke execute on function pd.note_export(uuid) from public, anon;
grant execute on function pd.note_export(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Delete one client and everything held for it
-- ---------------------------------------------------------------------------
create function pd.delete_client(p_org uuid, p_name text, p_reason text) returns void
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
          || v_cases || ' cases (' || v_open || ' still open) and ' || v_inbox || ' inbox messages. Why: ' || v_reason);

  -- Cases, their audit trails and pauses, inbox messages and their logs, pending form
  -- submissions, reference counters and any membership limited to this client all go with it.
  delete from pd.organisations where id = o.id;
end $$;
revoke execute on function pd.delete_client(uuid, text, text) from public, anon;
grant execute on function pd.delete_client(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Close a whole desk (for whoever operates Privacy Desk, not for its users)
-- ---------------------------------------------------------------------------
create table pd.closed_desks (
  id         bigint generated always as identity primary key,
  closed_at  timestamptz not null default now(),
  name       text not null,
  kind       text not null,
  opened_at  timestamptz,
  -- How much was deleted; numbers only.
  clients    bigint not null,
  cases      bigint not null,
  people     bigint not null,
  reason     text not null
);
alter table pd.closed_desks enable row level security;
-- No policy: nobody signed in to the app can read or write it.
revoke all on pd.closed_desks from authenticated, anon;

create function pd.close_desk(p_partner uuid, p_name text, p_reason text) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  p        pd.partners%rowtype;
  v_reason text := trim(regexp_replace(coalesce(p_reason, ''), '[[:space:]]+', ' ', 'g'));
begin
  select * into p from pd.partners where id = p_partner for update;
  if not found then
    raise exception 'No such desk' using errcode = 'no_data_found';
  end if;
  if p_name is null or trim(p_name) <> p.name then
    raise exception 'The name given does not match the desk''s name' using errcode = 'check_violation';
  end if;
  if length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Say who asked for this and why, in 5 to 500 characters' using errcode = 'check_violation';
  end if;
  insert into pd.closed_desks (name, kind, opened_at, clients, cases, people, reason)
  values (p.name, p.kind, p.created_at,
          (select count(*) from pd.organisations o where o.partner_id = p.id),
          (select count(*) from pd.cases c join pd.organisations o on o.id = c.organisation_id where o.partner_id = p.id),
          (select count(*) from pd.members m where m.partner_id = p.id),
          v_reason);
  -- Everything the desk holds goes with it: clients, cases, audit trails, the team and its log.
  delete from pd.partners where id = p.id;
end $$;
-- Functions are open to signed-in users by default (0002). This one is for the operator only.
revoke execute on function pd.close_desk(uuid, text, text) from public, anon, authenticated;
