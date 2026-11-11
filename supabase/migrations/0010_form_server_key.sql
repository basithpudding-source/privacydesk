-- Privacy Desk: only the app's server may write public form submissions.
--
-- pd.form_submit and pd.form_verify were callable by the anonymous role with the publishable
-- key, which is in every browser. The caller chose the token hash, so anyone could submit a
-- request under any email address and then "verify" it with the token they had picked: the
-- item reached the inbox marked "email address verified" without an email ever being opened.
-- The same route skipped the per-sender cap.
--
-- These functions now also need a server key: a long random value the app's server holds in
-- FORM_SERVER_KEY and the database holds only as a hash. Without it they refuse, so the only
-- way to a verified request is through the app, which emails the link to the address given.
-- The service role is still used by the nightly job alone.
--
-- After running this file, set the key once (SQL editor), with the same value as the app's
-- FORM_SERVER_KEY:
--   select pd.set_server_key('public_form', '<the value of FORM_SERVER_KEY>');
-- Until then the public form refuses every submission.

create table pd.server_keys (
  name      text primary key,
  key_hash  text not null check (key_hash ~ '^[0-9a-f]{64}$'),   -- sha256 of the key, hex
  set_at    timestamptz not null default now()
);
alter table pd.server_keys enable row level security;
-- No policies and no grants: only the two functions below touch this table.
revoke all on pd.server_keys from anon, authenticated;

create function pd.set_server_key(p_name text, p_key text) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
begin
  if length(coalesce(p_key, '')) < 32 then
    raise exception 'Use a key of at least 32 characters' using errcode = 'check_violation';
  end if;
  insert into pd.server_keys (name, key_hash)
  values (p_name, encode(sha256(convert_to(p_key, 'UTF8')), 'hex'))
  on conflict (name) do update set key_hash = excluded.key_hash, set_at = now();
end $$;

create function pd.require_server_key(p_name text, p_key text) returns void
language plpgsql stable security definer set search_path = pd, pg_temp as $$
begin
  if p_key is null or not exists (
    select 1 from pd.server_keys k
    where k.name = p_name and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception 'This can only be done by the app''s server' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Neither is for any API role: the owner sets the key by hand, and the form functions
-- (definer rights) do the checking.
revoke execute on function pd.set_server_key(text, text) from public, anon, authenticated;
revoke execute on function pd.require_server_key(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The three form functions, each with the server key as a last argument. Bodies are as in
-- 0008 and 0006 apart from the key check, and a row lock in form_verify so two openings of
-- the same link at the same moment cannot create two inbox items.
-- ---------------------------------------------------------------------------
drop function pd.form_submit(text, text, text, text, text, text, text);
create function pd.form_submit(
  p_code        text,
  p_token_hash  text,
  p_name        text,
  p_email       text,
  p_type        text,
  p_details     text,
  p_sender_hash text,
  p_server_key  text
) returns text
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  org     pd.organisations%rowtype;
  v_n     int;
  v_ref   text;
  v_email text := lower(trim(p_email));
begin
  perform pd.require_server_key('public_form', p_server_key);

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

drop function pd.form_verify(text, text);
create function pd.form_verify(p_code text, p_token_hash text, p_server_key text)
returns table (
  ref               text,
  received_on       date,
  request_type      text,
  requester_name    text,
  requester_email   text,
  details           text,
  organisation_name text,
  colour            text,
  region            text,
  contact_email     text,
  ai_enabled        boolean,
  inbox_item_id     uuid,
  already_verified  boolean
)
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  s         pd.form_submissions%rowtype;
  org       pd.organisations%rowtype;
  v_item    uuid;
  v_already boolean := false;
  v_today   date;
begin
  perform pd.require_server_key('public_form', p_server_key);

  select fs.* into s from pd.form_submissions fs join pd.organisations o on o.id = fs.organisation_id
   where fs.token_hash = p_token_hash and lower(o.code) = lower(trim(p_code))
   for update of fs;
  if not found then
    raise exception 'This link is not recognised' using errcode = 'no_data_found';
  end if;
  select * into org from pd.organisations where id = s.organisation_id;

  if s.verified_at is not null then
    v_already := true;
    v_item := s.inbox_item_id;
  else
    if s.expires_at < now() then
      raise exception 'This link has expired' using errcode = 'invalid_parameter_value';
    end if;
    insert into pd.inbox_items (organisation_id, channel, from_name, from_email, subject, body, source_ref, requested_type)
    values (s.organisation_id, 'form', s.requester_name, s.requester_email,
            case s.request_type when 'sar' then 'Request for a copy of my personal data'
                                when 'complaint' then 'Complaint about how my personal data was handled'
                                else 'Request about my personal data' end || ' (' || s.ref || ')',
            s.details, s.ref, s.request_type)
    returning id into v_item;
    update pd.form_submissions set verified_at = now(), inbox_item_id = v_item where id = s.id;
    s.verified_at := now();
  end if;

  v_today := (s.verified_at at time zone 'Europe/London')::date;
  return query select s.ref, v_today, s.request_type, s.requester_name, s.requester_email, s.details,
                      org.name, org.colour, org.region, org.contact_email, org.ai_enabled, v_item, v_already;
end $$;

drop function pd.form_set_triage(text, jsonb);
create function pd.form_set_triage(p_token_hash text, p_triage jsonb, p_server_key text) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
begin
  perform pd.require_server_key('public_form', p_server_key);

  update pd.inbox_items i
     set triage = p_triage
    from pd.form_submissions s
   where s.token_hash = p_token_hash and i.id = s.inbox_item_id and i.status = 'new';
  if not found then
    raise exception 'No new inbox item for that link' using errcode = 'no_data_found';
  end if;
end $$;

-- The anonymous role may still call them: the app's server has no user session on a public
-- page. What it can no longer do is call them usefully without the key.
revoke execute on function pd.form_submit(text, text, text, text, text, text, text, text) from public;
revoke execute on function pd.form_verify(text, text, text) from public;
revoke execute on function pd.form_set_triage(text, jsonb, text) from public;
grant execute on function pd.form_submit(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function pd.form_verify(text, text, text) to anon, authenticated;
grant execute on function pd.form_set_triage(text, jsonb, text) to anon, authenticated;
