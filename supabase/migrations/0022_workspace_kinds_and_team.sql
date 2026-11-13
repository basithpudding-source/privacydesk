-- Privacy Desk: two kinds of desk, and a team with levels of access.
--
-- Until now every desk was a consultancy acting for client organisations, with one person in
-- it. This adds:
--
--   1. pd.partners.kind: 'consultancy' (as before) or 'organisation', an organisation's own
--      team handling its own requests and complaints. An organisation's desk has exactly one
--      row in pd.organisations (itself), created with the desk; the app then hides everything
--      about "clients".
--   2. A team. An administrator adds a colleague by email address with a level of access; when
--      that person signs in with that address they can join. Changing someone's access and
--      removing them go through the functions here, and each change is written to
--      pd.team_events, a log nobody can edit.
--   3. Two-step sign-in for everyone who can see the whole desk, not only administrators.
--
-- Levels of access are the existing roles: partner_admin (administrator), client_user (case
-- handler) and read_only. People added to the team see the whole desk (organisation_id null).

-- ---------------------------------------------------------------------------
-- 1. The kind of desk
-- ---------------------------------------------------------------------------
alter table pd.partners
  add column kind text not null default 'consultancy' check (kind in ('consultancy', 'organisation'));

-- ---------------------------------------------------------------------------
-- 2. Members: who they are, and no changes except through the functions below
-- ---------------------------------------------------------------------------
alter table pd.members
  add column email    text,
  add column added_by uuid;

-- The address each existing member signs in with, so the team page can name them.
update pd.members m set email = lower(u.email)
from auth.users u where u.id = m.user_id and m.email is null;

-- Administrators could insert, change and delete memberships directly, with no record kept.
-- They may still read them; every change now goes through a function that writes the log.
drop policy members_admin on pd.members;
create policy members_admin_read on pd.members for select using (pd.is_partner_admin(partner_id));
revoke insert, update, delete on pd.members from authenticated;

-- ---------------------------------------------------------------------------
-- 3. People who have been added but have not signed in yet
-- ---------------------------------------------------------------------------
create table pd.invitations (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references pd.partners (id) on delete cascade,
  email       text not null check (email = lower(email) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  role        text not null check (role in ('partner_admin', 'client_user', 'read_only')),
  invited_by  uuid not null,
  created_at  timestamptz not null default now(),
  unique (partner_id, email)
);
create index invitations_email on pd.invitations (email);

alter table pd.invitations enable row level security;
create policy invitations_admin_read on pd.invitations for select using (pd.is_partner_admin(partner_id));
-- New tables are given write access by default (0002); these are written by functions only.
revoke insert, update, delete on pd.invitations from authenticated;
grant select on pd.invitations to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The team log: who was given access, by whom, and every change since
-- ---------------------------------------------------------------------------
create table pd.team_events (
  id           bigint generated always as identity primary key,
  partner_id   uuid not null references pd.partners (id) on delete cascade,
  at           timestamptz not null default now(),
  actor        uuid,
  actor_email  text,
  text         text not null
);
create index team_events_partner on pd.team_events (partner_id, id desc);

alter table pd.team_events enable row level security;
create policy team_events_admin_read on pd.team_events for select using (pd.is_partner_admin(partner_id));
revoke insert, update, delete on pd.team_events from authenticated;
grant select on pd.team_events to authenticated;

create function pd.block_team_event_changes() returns trigger language plpgsql as $$
begin
  -- Entries go only when the whole desk is deleted; nobody edits or removes them.
  if tg_op = 'UPDATE' then
    raise exception 'The team log cannot be edited';
  end if;
  if tg_op = 'DELETE' and exists (select 1 from pd.partners where id = old.partner_id) then
    raise exception 'Team log entries cannot be removed';
  end if;
  return old;
end $$;
create trigger team_events_append_only before update or delete on pd.team_events
  for each row execute function pd.block_team_event_changes();

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------
-- The address the signed-in person has proved is theirs. Read from the sign-in system's own
-- record, not from anything the browser sends. Used only inside the functions below.
create function pd.verified_email() returns text
language sql stable security definer set search_path = pd, pg_temp as $$
  select lower(u.email)::text from auth.users u
  where u.id = pd.current_user_id() and u.email_confirmed_at is not null
$$;
revoke execute on function pd.verified_email() from public, anon, authenticated;

create function pd.role_words(p_role text) returns text language sql immutable as $$
  select case p_role when 'partner_admin' then 'an administrator'
                     when 'client_user'   then 'a case handler'
                     when 'read_only'     then 'read only'
                     else p_role end
$$;

-- ---------------------------------------------------------------------------
-- 6. Setting up a desk of either kind
-- ---------------------------------------------------------------------------
-- For an organisation's own desk the organisation is created here too, with the short code
-- that starts its case references.
create function pd.create_workspace(
  p_name   text,
  p_kind   text,
  p_code   text default null,
  p_region text default 'england-and-wales'
) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  uid  uuid := pd.current_user_id();
  pid  uuid;
  nm   text := trim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
  cd   text := upper(trim(coalesce(p_code, '')));
  em   text := pd.verified_email();
begin
  if uid is null then
    raise exception 'Sign in before setting up a desk' using errcode = 'insufficient_privilege';
  end if;
  if p_kind is null or p_kind not in ('consultancy', 'organisation') then
    raise exception 'Choose who the desk is for' using errcode = 'invalid_parameter_value';
  end if;
  if length(nm) < 2 or length(nm) > 120 then
    raise exception 'Give it a name of 2 to 120 characters' using errcode = 'check_violation';
  end if;
  if exists (select 1 from pd.members m where m.user_id = uid) then
    raise exception 'You already belong to a desk' using errcode = 'unique_violation';
  end if;
  if p_kind = 'organisation' then
    if cd !~ '^[A-Z0-9]{2,6}$' then
      raise exception 'The short code needs 2 to 6 letters or digits' using errcode = 'check_violation', hint = 'code';
    end if;
    if exists (select 1 from pd.organisations o where lower(o.code) = lower(cd)) then
      raise exception 'That short code is already in use' using errcode = 'unique_violation', hint = 'code_taken';
    end if;
  end if;

  insert into pd.partners (name, kind) values (nm, p_kind) returning id into pid;
  insert into pd.members (user_id, partner_id, organisation_id, role, email)
    values (uid, pid, null, 'partner_admin', em);
  if p_kind = 'organisation' then
    insert into pd.organisations (partner_id, name, code, region)
      values (pid, nm, cd, coalesce(nullif(trim(p_region), ''), 'england-and-wales'));
  end if;
  insert into pd.team_events (partner_id, actor, actor_email, text)
    values (pid, uid, em, 'Set up the desk and became its first administrator');
  return pid;
end $$;
revoke execute on function pd.create_workspace(text, text, text, text) from public, anon;
grant execute on function pd.create_workspace(text, text, text, text) to authenticated;

-- The old name still works, so the app can be updated before or after this migration.
create or replace function pd.create_partner(p_name text) returns uuid
language sql set search_path = pd, pg_temp as $$
  select pd.create_workspace(p_name, 'consultancy')
$$;

-- ---------------------------------------------------------------------------
-- 7. Adding people
-- ---------------------------------------------------------------------------
create function pd.invite_member(p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  uid  uuid := pd.current_user_id();
  pid  uuid;
  em   text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
begin
  select m.partner_id into pid from pd.members m
   where m.user_id = uid and m.role = 'partner_admin' and m.organisation_id is null limit 1;
  if pid is null or not pd.is_partner_admin(pid) then
    raise exception 'Only an administrator can add people' using errcode = 'insufficient_privilege';
  end if;
  if length(em) > 254 or em !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'That does not look like an email address' using errcode = 'check_violation';
  end if;
  if p_role is null or p_role not in ('partner_admin', 'client_user', 'read_only') then
    raise exception 'Choose a level of access' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from pd.members m where m.partner_id = pid and m.email = em) then
    raise exception 'That person is already in the team' using errcode = 'unique_violation', hint = 'member';
  end if;
  if exists (select 1 from pd.invitations i where i.partner_id = pid and i.email = em) then
    raise exception 'That person has already been added and has not signed in yet' using errcode = 'unique_violation', hint = 'invited';
  end if;
  if (select count(*) from pd.invitations i where i.partner_id = pid) >= 50 then
    raise exception 'Fifty people are waiting to sign in; withdraw one before adding another' using errcode = 'program_limit_exceeded';
  end if;

  insert into pd.invitations (partner_id, email, role, invited_by) values (pid, em, p_role, uid) returning id into v_id;
  insert into pd.team_events (partner_id, actor, actor_email, text)
    values (pid, uid, pd.verified_email(), 'Added ' || em || ' as ' || pd.role_words(p_role) || '; they join when they sign in');
  return v_id;
end $$;
revoke execute on function pd.invite_member(text, text) from public, anon;
grant execute on function pd.invite_member(text, text) to authenticated;

create function pd.cancel_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  inv pd.invitations%rowtype;
begin
  select * into inv from pd.invitations where id = p_id for update;
  if not found or not pd.is_partner_admin(inv.partner_id) then
    -- The same answer whether it is missing or someone else's, so nothing is given away.
    raise exception 'That person is no longer waiting to join' using errcode = 'no_data_found';
  end if;
  delete from pd.invitations where id = inv.id;
  insert into pd.team_events (partner_id, actor, actor_email, text)
    values (inv.partner_id, pd.current_user_id(), pd.verified_email(), 'Withdrew the invitation for ' || inv.email);
end $$;
revoke execute on function pd.cancel_invitation(uuid) from public, anon;
grant execute on function pd.cancel_invitation(uuid) to authenticated;

-- What the signed-in person has been added to, matched on the address they have proved.
create function pd.pending_invitations() returns table (id uuid, desk text, kind text, role text)
language sql stable security definer set search_path = pd, pg_temp as $$
  select i.id, p.name, p.kind, i.role
  from pd.invitations i join pd.partners p on p.id = i.partner_id
  where i.email = pd.verified_email()
  order by i.created_at
$$;
revoke execute on function pd.pending_invitations() from public, anon;
grant execute on function pd.pending_invitations() to authenticated;

create function pd.accept_invitation(p_id uuid) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  uid uuid := pd.current_user_id();
  em  text := pd.verified_email();
  inv pd.invitations%rowtype;
begin
  if uid is null or em is null then
    raise exception 'Sign in with a confirmed email address first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from pd.members m where m.user_id = uid) then
    raise exception 'You already belong to a desk' using errcode = 'unique_violation';
  end if;
  select * into inv from pd.invitations where id = p_id and email = em for update;
  if not found then
    raise exception 'That invitation is no longer open' using errcode = 'no_data_found';
  end if;

  insert into pd.members (user_id, partner_id, organisation_id, role, email, added_by)
    values (uid, inv.partner_id, null, inv.role, em, inv.invited_by);
  delete from pd.invitations where id = inv.id;
  insert into pd.team_events (partner_id, actor, actor_email, text)
    values (inv.partner_id, uid, em, em || ' signed in and joined as ' || pd.role_words(inv.role));
  return inv.partner_id;
end $$;
revoke execute on function pd.accept_invitation(uuid) from public, anon;
grant execute on function pd.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Changing access, and removing someone
-- ---------------------------------------------------------------------------
create function pd.set_member_role(p_member uuid, p_role text) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  m pd.members%rowtype;
begin
  select * into m from pd.members where id = p_member for update;
  if not found or not pd.is_partner_admin(m.partner_id) then
    raise exception 'That person is not in your team' using errcode = 'no_data_found';
  end if;
  if p_role is null or p_role not in ('partner_admin', 'client_user', 'read_only') then
    raise exception 'Choose a level of access' using errcode = 'invalid_parameter_value';
  end if;
  if m.role = p_role then
    return;
  end if;
  if m.role = 'partner_admin' and m.organisation_id is null
     and (select count(*) from pd.members x
           where x.partner_id = m.partner_id and x.role = 'partner_admin' and x.organisation_id is null) <= 1 then
    raise exception 'A desk needs at least one administrator. Make someone else an administrator first' using errcode = 'check_violation', hint = 'last_admin';
  end if;

  update pd.members set role = p_role where id = m.id;
  insert into pd.team_events (partner_id, actor, actor_email, text)
    values (m.partner_id, pd.current_user_id(), pd.verified_email(),
            'Changed ' || coalesce(m.email, 'a member') || ' from ' || pd.role_words(m.role) || ' to ' || pd.role_words(p_role));
end $$;
revoke execute on function pd.set_member_role(uuid, text) from public, anon;
grant execute on function pd.set_member_role(uuid, text) to authenticated;

create function pd.remove_member(p_member uuid) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  m pd.members%rowtype;
begin
  select * into m from pd.members where id = p_member for update;
  if not found or not pd.is_partner_admin(m.partner_id) then
    raise exception 'That person is not in your team' using errcode = 'no_data_found';
  end if;
  if m.user_id = pd.current_user_id() then
    raise exception 'You cannot remove yourself. Ask another administrator' using errcode = 'check_violation', hint = 'self';
  end if;

  delete from pd.members where id = m.id;
  insert into pd.team_events (partner_id, actor, actor_email, text)
    values (m.partner_id, pd.current_user_id(), pd.verified_email(),
            'Removed ' || coalesce(m.email, 'a member') || ', who was ' || pd.role_words(m.role));
end $$;
revoke execute on function pd.remove_member(uuid) from public, anon;
grant execute on function pd.remove_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Two-step sign-in for everyone who can see the whole desk
-- ---------------------------------------------------------------------------
-- 0008 asked it of administrators only, because nobody else could see more than one client.
-- A case handler added to the team sees every case, so the same rule now applies to anyone
-- whose membership is not limited to one client.
create or replace function pd.can_read_org(p_org uuid) returns boolean
language sql stable security definer set search_path = pd, pg_temp as $$
  select exists (
    select 1 from pd.members m join pd.organisations o on o.partner_id = m.partner_id
    where o.id = p_org and m.user_id = pd.current_user_id()
      and (m.organisation_id is null or m.organisation_id = o.id)
      and ((m.role <> 'partner_admin' and m.organisation_id is not null) or pd.current_aal() = 'aal2'))
$$;

create or replace function pd.can_write_org(p_org uuid) returns boolean
language sql stable security definer set search_path = pd, pg_temp as $$
  select exists (
    select 1 from pd.members m join pd.organisations o on o.partner_id = m.partner_id
    where o.id = p_org and m.user_id = pd.current_user_id() and m.role <> 'read_only'
      and (m.organisation_id is null or m.organisation_id = o.id)
      and ((m.role <> 'partner_admin' and m.organisation_id is not null) or pd.current_aal() = 'aal2'))
$$;
