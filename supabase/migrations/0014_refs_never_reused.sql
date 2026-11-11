-- Privacy Desk: a reference, once given out, is never given out again.
--
-- Case references (<code>-001) and web form references (<code>-W0001) were numbered from the
-- highest one still in the table. Retention deletes rows, so after a quiet spell a client's
-- numbering could start again: web form submissions are deleted 90 days after verification,
-- so a client with no form requests for three months went back to W0001, a reference an older
-- case still carries as its source. Case references had the same weakness once every closed
-- case had passed its retention date.
--
-- Each client now has a counter per kind of reference that only goes up, in a table nothing
-- but the two functions below can touch.

create table pd.ref_counters (
  organisation_id  uuid not null references pd.organisations (id) on delete cascade,
  kind             text not null check (kind in ('case', 'form')),
  last_no          int  not null check (last_no >= 0),
  primary key (organisation_id, kind)
);
alter table pd.ref_counters enable row level security;
-- No policies and no grants: only pd.next_ref_no writes here.
revoke all on pd.ref_counters from anon, authenticated;

-- Start each counter at the highest number already given out. Web form references are also
-- looked for on inbox items and cases, because the submissions themselves may be gone.
insert into pd.ref_counters (organisation_id, kind, last_no)
select organisation_id, 'case', max(substring(ref from '-([0-9]+)$')::int)
from pd.cases
where ref ~ '-[0-9]+$'
group by organisation_id;

insert into pd.ref_counters (organisation_id, kind, last_no)
select organisation_id, 'form', max(substring(ref from '-W([0-9]+)$')::int)
from (
  select organisation_id, ref from pd.form_submissions
  union all select organisation_id, source_ref from pd.inbox_items where source_ref is not null
  union all select organisation_id, source_ref from pd.cases where source_ref is not null
) r
where ref ~ '-W[0-9]+$'
group by organisation_id;

-- Take the next number. The row lock makes two callers wait their turn, so the advisory
-- locks the functions used before are no longer needed. If the calling transaction fails,
-- the number is given back with it.
create function pd.next_ref_no(p_organisation_id uuid, p_kind text) returns int
language sql security definer set search_path = pd, pg_temp as $$
  insert into pd.ref_counters as rc (organisation_id, kind, last_no)
  values (p_organisation_id, p_kind, 1)
  on conflict (organisation_id, kind) do update set last_no = rc.last_no + 1
  returning last_no
$$;
revoke execute on function pd.next_ref_no(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Create a case: as 0009, numbered from the counter. (The time zone setting is restated
-- because replacing a function drops the one added in 0013.)
-- ---------------------------------------------------------------------------
create or replace function pd.create_case(
  p_organisation_id uuid,
  p_type            text,
  p_received_on     date,
  p_channel         text    default 'Email',
  p_requester_name  text    default null,
  p_requester_email text    default null,
  p_summary         text    default null,
  p_message         text    default null,
  p_id_required     boolean default false
) returns uuid
language plpgsql security definer set search_path = pd, pg_temp set timezone = 'Europe/London' as $$
declare
  v_code text;
  v_ref  text;
  v_id   uuid;
  v_uid  uuid := pd.current_user_id();
begin
  if v_uid is null or not pd.can_write_org(p_organisation_id) then
    raise exception 'You cannot add cases for this client' using errcode = 'insufficient_privilege';
  end if;
  if p_received_on is null or p_received_on > current_date then
    raise exception 'Enter the date the request was received; it cannot be in the future' using errcode = 'check_violation';
  end if;
  if p_id_required and p_type = 'complaint' then
    raise exception 'Complaints do not need proof of identity' using errcode = 'check_violation';
  end if;

  select code into v_code from pd.organisations where id = p_organisation_id;

  -- The loop only matters if a reference with this number was put in by hand.
  loop
    v_ref := v_code || '-' || lpad(pd.next_ref_no(p_organisation_id, 'case')::text, 3, '0');
    exit when not exists (select 1 from pd.cases where ref = v_ref);
  end loop;

  insert into pd.cases (organisation_id, ref, type, channel, requester_name, requester_email,
                        received_on, summary, message, id_required)
  values (p_organisation_id, v_ref, p_type, coalesce(nullif(trim(p_channel), ''), 'Email'),
          nullif(trim(p_requester_name), ''), nullif(lower(trim(p_requester_email)), ''),
          p_received_on, nullif(trim(p_summary), ''), nullif(trim(p_message), ''), p_id_required)
  returning id into v_id;

  insert into pd.case_events (case_id, kind, text, actor) values (
    v_id, 'created',
    'Case logged by hand (' || coalesce(nullif(trim(p_channel), ''), 'Email') || '), received '
      || to_char(p_received_on, 'FMDD Mon YYYY')
      || case when p_id_required then '. Proof of identity needed before the clock starts' else '' end,
    v_uid);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Store a form submission: as 0010, numbered from the counter.
-- ---------------------------------------------------------------------------
create or replace function pd.form_submit(
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

  v_ref := org.code || '-W' || lpad(pd.next_ref_no(org.id, 'form')::text, 4, '0');

  insert into pd.form_submissions (organisation_id, ref, token_hash, requester_name, requester_email, request_type, details, sender_hash)
  values (org.id, v_ref, p_token_hash, trim(p_name), v_email, p_type, trim(p_details), p_sender_hash);
  return v_ref;
end $$;
