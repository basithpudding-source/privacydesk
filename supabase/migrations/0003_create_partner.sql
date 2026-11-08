-- Privacy Desk: let a newly signed-in user create their consultancy.
--
-- pd.partners has no insert policy and a membership can only be added by an existing
-- partner admin, so without this a brand-new user could never get started. The function
-- runs with definer rights, creates the partner and makes the caller its admin in one step.
-- One consultancy per user for now; inviting colleagues is an open question in docs/DECISIONS.md.

create function pd.create_partner(p_name text) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  uid  uuid := pd.current_user_id();
  pid  uuid;
  nm   text := trim(coalesce(p_name, ''));
begin
  if uid is null then
    raise exception 'Sign in before creating a consultancy' using errcode = 'insufficient_privilege';
  end if;
  if length(nm) < 2 or length(nm) > 120 then
    raise exception 'Give the consultancy a name of 2 to 120 characters' using errcode = 'check_violation';
  end if;
  if exists (select 1 from pd.members m where m.user_id = uid) then
    raise exception 'You already belong to a consultancy' using errcode = 'unique_violation';
  end if;
  insert into pd.partners (name) values (nm) returning id into pid;
  insert into pd.members (user_id, partner_id, organisation_id, role)
    values (uid, pid, null, 'partner_admin');
  return pid;
end $$;

-- Postgres grants execute to everyone by default; keep it to signed-in users.
revoke execute on function pd.create_partner(text) from public, anon;
grant execute on function pd.create_partner(text) to authenticated;
