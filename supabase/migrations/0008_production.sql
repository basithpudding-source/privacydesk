-- Privacy Desk: production checklist (slice 7). Two rules move from the app into the database,
-- where they cannot be skipped: a partner admin must have passed a second factor before the
-- policies let them see or change anything, and the public form caps each sender address.

-- ---------------------------------------------------------------------------
-- The authenticator assurance level from the token: 'aal2' after a second factor, else 'aal1'.
-- Supabase puts it in request.jwt.claims; the schema test sets request.jwt.claim.aal directly.
-- ---------------------------------------------------------------------------
create function pd.current_aal() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.aal', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    'aal1')
$$;

-- A partner admin's membership counts only at aal2. Other roles are unchanged: they see
-- one client's data at most and the app does not require a second factor of them yet.
create or replace function pd.can_read_org(p_org uuid) returns boolean
language sql stable security definer set search_path = pd, pg_temp as $$
  select exists (
    select 1 from pd.members m join pd.organisations o on o.partner_id = m.partner_id
    where o.id = p_org and m.user_id = pd.current_user_id()
      and (m.organisation_id is null or m.organisation_id = o.id)
      and (m.role <> 'partner_admin' or pd.current_aal() = 'aal2'))
$$;

create or replace function pd.can_write_org(p_org uuid) returns boolean
language sql stable security definer set search_path = pd, pg_temp as $$
  select exists (
    select 1 from pd.members m join pd.organisations o on o.partner_id = m.partner_id
    where o.id = p_org and m.user_id = pd.current_user_id() and m.role <> 'read_only'
      and (m.organisation_id is null or m.organisation_id = o.id)
      and (m.role <> 'partner_admin' or pd.current_aal() = 'aal2'))
$$;

create or replace function pd.is_partner_admin(p_partner uuid) returns boolean
language sql stable security definer set search_path = pd, pg_temp as $$
  select exists (select 1 from pd.members m where m.partner_id = p_partner
                 and m.user_id = pd.current_user_id() and m.role = 'partner_admin' and m.organisation_id is null)
         and pd.current_aal() = 'aal2'
$$;
-- members_self and partners_read are left as they are: the app needs a user's own membership
-- row and their consultancy's name to tell an admin to enrol or enter a code.

-- ---------------------------------------------------------------------------
-- Public form: cap each sender address at ten submissions an hour per client, on top of the
-- five per email address. The app sends a salted hash of the address, never the address.
-- ---------------------------------------------------------------------------
alter table pd.form_submissions add column sender_hash text;
create index form_submissions_sender on pd.form_submissions (organisation_id, sender_hash, created_at desc);

drop function pd.form_submit(text, text, text, text, text, text);
create function pd.form_submit(
  p_code        text,
  p_token_hash  text,
  p_name        text,
  p_email       text,
  p_type        text,
  p_details     text,
  p_sender_hash text default null
) returns text
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  org     pd.organisations%rowtype;
  v_n     int;
  v_ref   text;
  v_email text := lower(trim(p_email));
begin
  select * into org from pd.organisations where lower(code) = lower(trim(p_code));
  if not found then
    raise exception 'There is no form at this address' using errcode = 'no_data_found';
  end if;
  if not org.form_enabled then
    raise exception 'This organisation is not taking requests through this form at the moment' using errcode = 'invalid_parameter_value';
  end if;
  if length(coalesce(trim(p_name), '')) < 2 or length(p_name) > 200 then
    raise exception 'Enter your name' using errcode = 'check_violation';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Enter an email address we can send the link to' using errcode = 'check_violation';
  end if;
  if p_type not in ('sar', 'complaint', 'other') then
    raise exception 'Choose what you want to do' using errcode = 'check_violation';
  end if;
  if length(coalesce(trim(p_details), '')) < 10 or length(p_details) > 10000 then
    raise exception 'Tell us what you are asking for, in a sentence or more (up to 10,000 characters)' using errcode = 'check_violation';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad token hash' using errcode = 'check_violation';
  end if;
  if p_sender_hash is not null and p_sender_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad sender hash' using errcode = 'check_violation';
  end if;
  if (select count(*) from pd.form_submissions
       where organisation_id = org.id and requester_email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests from this email address in the last hour. Try again later' using errcode = 'program_limit_exceeded';
  end if;
  if p_sender_hash is not null and (select count(*) from pd.form_submissions
       where organisation_id = org.id and sender_hash = p_sender_hash and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many requests from this connection in the last hour. Try again later' using errcode = 'program_limit_exceeded';
  end if;

  perform pg_advisory_xact_lock(hashtext(org.id::text || ':form'));
  select coalesce(max(substring(ref from '[0-9]+$')::int), 0) + 1 into v_n
  from pd.form_submissions where organisation_id = org.id;
  v_ref := org.code || '-W' || lpad(v_n::text, 4, '0');

  insert into pd.form_submissions (organisation_id, ref, token_hash, requester_name, requester_email, request_type, details, sender_hash)
  values (org.id, v_ref, p_token_hash, trim(p_name), v_email, p_type, trim(p_details), p_sender_hash);
  return v_ref;
end $$;

revoke execute on function pd.form_submit(text, text, text, text, text, text, text) from public;
grant execute on function pd.form_submit(text, text, text, text, text, text, text) to anon, authenticated;
