-- Privacy Desk: the public form (slice 5). A member of the public fills in a short form at
-- /r/<client code>, proves their email address by clicking a one-time link, and only then does
-- the request reach the consultancy's inbox (design standard §6). The clock starts on the day
-- the link is clicked, because that is when the request is complete.
--
-- The public route holds no user session, so these functions run with definer rights and the
-- client code (public) or the hashed link token (secret, single purpose) is the credential.
-- The anonymous role may call them; it still has no table grants.

-- ---------------------------------------------------------------------------
-- Client codes must be unique across every consultancy, because /r/<code> has to name one
-- client. Case references (<code>-<n>) are already unique across the whole table, so this only
-- makes an existing assumption explicit.
-- ---------------------------------------------------------------------------
create unique index organisations_code_global on pd.organisations (lower(code));

alter table pd.organisations
  add column form_enabled  boolean not null default true,
  add column contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- The reference the requester was given on the confirmation, carried onto the item and the case
-- so staff can find a request from the number quoted on the phone.
alter table pd.inbox_items
  add column source_ref     text,
  add column requested_type text check (requested_type in ('sar', 'complaint', 'other'));  -- what the requester chose
alter table pd.cases add column source_ref text;

-- ---------------------------------------------------------------------------
-- Pending submissions: stored when the form is sent, turned into an inbox item when the link
-- is clicked. No policies and no grants: only the functions below touch this table.
-- ---------------------------------------------------------------------------
create table pd.form_submissions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references pd.organisations (id) on delete cascade,
  ref              text not null unique,          -- <code>-W0001, numbered per client
  token_hash       text not null unique,          -- sha256 of the one-time link token, hex
  requester_name   text not null,
  requester_email  text not null,
  request_type     text not null check (request_type in ('sar', 'complaint', 'other')),
  details          text not null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '24 hours',
  verified_at      timestamptz,
  inbox_item_id    uuid references pd.inbox_items (id) on delete set null
);
create index form_submissions_org_email on pd.form_submissions (organisation_id, requester_email, created_at desc);
alter table pd.form_submissions enable row level security;
-- 0002 set default privileges that hand every new table to the signed-in role; take them back,
-- so a query on this table is refused outright rather than answered with no rows.
revoke all on pd.form_submissions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the public page may know about a client: enough to draw the form, nothing else.
-- ---------------------------------------------------------------------------
create function pd.form_lookup(p_code text)
returns table (name text, code text, colour text, region text, form_enabled boolean, contact_email text)
language sql security definer set search_path = pd, pg_temp as $$
  select name, code, colour, region, form_enabled, contact_email
  from pd.organisations where lower(code) = lower(trim(p_code))
$$;

-- ---------------------------------------------------------------------------
-- Store a submission and return its reference. The app has already emailed the raw token.
-- ---------------------------------------------------------------------------
create function pd.form_submit(
  p_code       text,
  p_token_hash text,
  p_name       text,
  p_email      text,
  p_type       text,
  p_details    text
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
  -- A small brake on one address hammering one form; proper rate limits join slice 7.
  if (select count(*) from pd.form_submissions
       where organisation_id = org.id and requester_email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests from this email address in the last hour. Try again later' using errcode = 'program_limit_exceeded';
  end if;

  -- One number at a time per client, as for case references.
  perform pg_advisory_xact_lock(hashtext(org.id::text || ':form'));
  select coalesce(max(substring(ref from '[0-9]+$')::int), 0) + 1 into v_n
  from pd.form_submissions where organisation_id = org.id;
  v_ref := org.code || '-W' || lpad(v_n::text, 4, '0');

  insert into pd.form_submissions (organisation_id, ref, token_hash, requester_name, requester_email, request_type, details)
  values (org.id, v_ref, p_token_hash, trim(p_name), v_email, p_type, trim(p_details));
  return v_ref;
end $$;

-- ---------------------------------------------------------------------------
-- The link was clicked: mark the submission verified and put it in the inbox. Clicking the
-- same link again returns the same confirmation and creates nothing. Returns what the
-- confirmation page and email need, plus what the app needs to run triage.
-- ---------------------------------------------------------------------------
create function pd.form_verify(p_code text, p_token_hash text)
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
  select fs.* into s from pd.form_submissions fs join pd.organisations o on o.id = fs.organisation_id
   where fs.token_hash = p_token_hash and lower(o.code) = lower(trim(p_code));
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

-- Attach the triage proposal to the item the link created. Keyed by the same token.
create function pd.form_set_triage(p_token_hash text, p_triage jsonb) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
begin
  update pd.inbox_items i
     set triage = p_triage
    from pd.form_submissions s
   where s.token_hash = p_token_hash and i.id = s.inbox_item_id and i.status = 'new';
  if not found then
    raise exception 'No new inbox item for that link' using errcode = 'no_data_found';
  end if;
end $$;

revoke execute on function pd.form_lookup(text) from public;
revoke execute on function pd.form_submit(text, text, text, text, text, text) from public;
revoke execute on function pd.form_verify(text, text) from public;
revoke execute on function pd.form_set_triage(text, jsonb) from public;
grant execute on function pd.form_lookup(text) to anon, authenticated;
grant execute on function pd.form_submit(text, text, text, text, text, text) to anon, authenticated;
grant execute on function pd.form_verify(text, text) to anon, authenticated;
grant execute on function pd.form_set_triage(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accepting a form item carries the requester's reference onto the case and says in the
-- audit trail that the address was verified.
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
language plpgsql security invoker set search_path = pd, pg_temp as $$
declare
  it       pd.inbox_items%rowtype;
  v_case   uuid;
  v_uid    uuid := pd.current_user_id();
  v_by     text;
  v_conf   numeric;
  v_lead   text;
begin
  select * into it from pd.inbox_items where id = p_item_id;
  if not found then
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

-- ---------------------------------------------------------------------------
-- Retention now also clears submissions: unverified ones a week after the link expired,
-- verified ones after 90 days (the inbox item or case holds the request by then).
-- ---------------------------------------------------------------------------
create or replace function pd.apply_retention() returns int
language plpgsql security definer set search_path = pd, pg_temp as $$
declare n int; m int;
begin
  delete from pd.cases c using pd.organisations o
  where o.id = c.organisation_id and c.status = 'closed'
    and c.closed_on < current_date - make_interval(months => o.retention_months);
  get diagnostics n = row_count;
  delete from pd.form_submissions
  where (verified_at is null and expires_at < now() - interval '7 days')
     or (verified_at is not null and verified_at < now() - interval '90 days');
  get diagnostics m = row_count;
  return n + m;
end $$;
