-- Privacy Desk: name the people on the audit trails.
--
-- Every log (a case's audit trail, the inbox log) keeps who did something as a sign-in id. With
-- one person in a desk that read as "you". With a team, a colleague's actions read as a short
-- code, which tells an auditor nothing. This keeps a directory of everyone who has ever been in
-- a desk: their sign-in address and the name they have chosen for themselves. It stays after a
-- person is removed from the team, marked as left, so what they did still carries their name.
--
-- The directory is kept by a trigger on memberships, so no other function has to remember to
-- update it, and people cannot write to it. A person's name comes from their own profile.

-- ---------------------------------------------------------------------------
-- 1. The directory
-- ---------------------------------------------------------------------------
create table pd.people (
  partner_id  uuid not null references pd.partners (id) on delete cascade,
  user_id     uuid not null,
  email       text,
  name        text check (name is null or length(name) between 1 and 80),
  first_seen  timestamptz not null default now(),
  -- Set when the person's last membership of the desk is removed; cleared if they are added again.
  left_at     timestamptz,
  primary key (partner_id, user_id)
);

alter table pd.people enable row level security;
-- Anyone in a desk may read who is, or was, in it. A person who can see the whole desk must
-- have passed their second factor, as for everything else they see (0022).
create policy people_read on pd.people for select using (
  exists (select 1 from pd.members m
          where m.partner_id = people.partner_id and m.user_id = pd.current_user_id()
            and ((m.role <> 'partner_admin' and m.organisation_id is not null) or pd.current_aal() = 'aal2')));
-- New tables are given write access by default (0002); this one is written by the trigger
-- and the function below only.
revoke insert, update, delete on pd.people from authenticated;
grant select on pd.people to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Kept in step with memberships
-- ---------------------------------------------------------------------------
-- The name a person has saved on their profile, read from the sign-in system's own record.
create function pd.profile_name(p_user uuid) returns text
language sql stable security definer set search_path = pd, pg_temp as $$
  select nullif(left(trim(regexp_replace(coalesce(u.raw_user_meta_data ->> 'display_name', ''), '[[:space:]]+', ' ', 'g')), 80), '')
  from auth.users u where u.id = p_user
$$;
revoke execute on function pd.profile_name(uuid) from public, anon, authenticated;

create function pd.keep_people() returns trigger
language plpgsql security definer set search_path = pd, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    -- Marked as left only when no other membership of the same desk remains.
    update pd.people p set left_at = now()
     where p.partner_id = old.partner_id and p.user_id = old.user_id
       and not exists (select 1 from pd.members m where m.partner_id = old.partner_id and m.user_id = old.user_id);
    return old;
  end if;
  insert into pd.people (partner_id, user_id, email, name)
  values (new.partner_id, new.user_id, new.email, pd.profile_name(new.user_id))
  on conflict (partner_id, user_id) do update
    set email = coalesce(excluded.email, pd.people.email),
        name = coalesce(excluded.name, pd.people.name),
        left_at = null;
  return new;
end $$;
create trigger members_keep_people after insert or update of email or delete on pd.members
  for each row execute function pd.keep_people();

-- Everyone already in a desk.
insert into pd.people (partner_id, user_id, email, name)
select distinct on (m.partner_id, m.user_id) m.partner_id, m.user_id, m.email, pd.profile_name(m.user_id)
from pd.members m
order by m.partner_id, m.user_id, m.created_at
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. A person's own name
-- ---------------------------------------------------------------------------
-- Called when someone saves their profile. The name is taken from their sign-in record, not
-- from what the browser sends, so nobody can give themselves a name they have not saved there.
create function pd.sync_my_name() returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  uid uuid := pd.current_user_id();
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  update pd.people set name = pd.profile_name(uid) where user_id = uid;
end $$;
revoke execute on function pd.sync_my_name() from public, anon;
grant execute on function pd.sync_my_name() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. A loose end from 0022
-- ---------------------------------------------------------------------------
-- role_words only turns a level of access into words, but every other function is closed to
-- anonymous callers, and so is this one now.
revoke execute on function pd.role_words(text) from public, anon;
grant execute on function pd.role_words(text) to authenticated;
