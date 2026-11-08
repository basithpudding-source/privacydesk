-- Privacy Desk: the inbox. Messages land here first and a person accepts or declines each one,
-- so the case list stays clean (design standard §1). AI only proposes; the accept function
-- records what was proposed and what the person confirmed.

-- Per-client inbound token: the local part of the forwarding address is <code>-<token>, so an
-- address cannot be guessed from the client code alone.
alter table pd.organisations
  add column inbound_token text not null default encode(gen_random_bytes(10), 'hex');
create unique index organisations_inbound_token on pd.organisations (inbound_token);

create table pd.inbox_items (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references pd.organisations (id) on delete cascade,
  received_at      timestamptz not null default now(),
  channel          text not null default 'email' check (channel in ('email', 'paste', 'form')),
  from_name        text,
  from_email       text,
  subject          text,
  body             text not null,
  message_id       text,                       -- provider id, to drop duplicate deliveries
  status           text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  triage           jsonb,                      -- the AI's (or keyword check's) proposal
  case_id          uuid references pd.cases (id) on delete set null,
  decided_by       uuid,
  decided_at       timestamptz,
  decline_reason   text,
  check (status <> 'accepted' or case_id is not null),
  check (status <> 'declined' or decline_reason is not null)
);
create index inbox_items_org_status on pd.inbox_items (organisation_id, status, received_at desc);
create unique index inbox_items_message_id on pd.inbox_items (organisation_id, message_id) where message_id is not null;

alter table pd.inbox_items enable row level security;
create policy inbox_read on pd.inbox_items for select using (pd.can_read_org(organisation_id));
create policy inbox_insert on pd.inbox_items for insert with check (pd.can_write_org(organisation_id));
create policy inbox_update on pd.inbox_items for update
  using (pd.can_write_org(organisation_id)) with check (pd.can_write_org(organisation_id));

grant select, insert, update on pd.inbox_items to authenticated;

-- ---------------------------------------------------------------------------
-- Accept: create the case from the fields the person confirmed, mark the item.
-- ---------------------------------------------------------------------------
create function pd.accept_inbox_item(
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

  -- Keep the proposal with the case, and say in the audit trail how the case was made.
  v_by   := coalesce(it.triage ->> 'by', 'nobody');
  v_conf := nullif(it.triage ->> 'confidence', '')::numeric;
  update pd.cases set triage = it.triage where id = v_case;
  insert into pd.case_events (case_id, kind, text, actor) values (
    v_case, 'triage',
    case
      when v_by = 'ai' then 'Accepted from the inbox. AI triage proposed ' || coalesce(it.triage ->> 'type', '?')
        || ' (' || coalesce(round(v_conf * 100)::text, '?') || '% confident); a person confirmed ' || p_type
      when v_by = 'keywords' then 'Accepted from the inbox. Keyword check suggested ' || coalesce(it.triage ->> 'type', '?')
        || '; a person confirmed ' || p_type
      else 'Accepted from the inbox without triage; a person chose ' || p_type
    end,
    v_uid);

  update pd.inbox_items
     set status = 'accepted', case_id = v_case, decided_by = v_uid, decided_at = now()
   where id = it.id;
  return v_case;
end $$;

create function pd.decline_inbox_item(p_item_id uuid, p_reason text) returns void
language plpgsql security invoker set search_path = pd, pg_temp as $$
declare
  it pd.inbox_items%rowtype;
begin
  select * into it from pd.inbox_items where id = p_item_id;
  if not found then
    raise exception 'That inbox item is not here' using errcode = 'no_data_found';
  end if;
  if not pd.can_write_org(it.organisation_id) then
    raise exception 'You cannot decline items for this client' using errcode = 'insufficient_privilege';
  end if;
  if it.status <> 'new' then
    raise exception 'This item was already %', it.status using errcode = 'invalid_parameter_value';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why it is being declined' using errcode = 'check_violation';
  end if;
  update pd.inbox_items
     set status = 'declined', decline_reason = trim(p_reason), decided_by = pd.current_user_id(), decided_at = now()
   where id = it.id;
end $$;

-- ---------------------------------------------------------------------------
-- Inbound email. The webhook knows only the client's token, not a user, so these run with
-- definer rights and the token is the credential. No service key is needed in the app.
-- ---------------------------------------------------------------------------
create function pd.receive_inbound_email(
  p_token      text,
  p_from_name  text,
  p_from_email text,
  p_subject    text,
  p_body       text,
  p_message_id text default null
) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  select id into v_org from pd.organisations where inbound_token = p_token;
  if v_org is null then
    raise exception 'Unknown forwarding address' using errcode = 'no_data_found';
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'The message has no text' using errcode = 'check_violation';
  end if;
  insert into pd.inbox_items (organisation_id, channel, from_name, from_email, subject, body, message_id)
  values (v_org, 'email', nullif(trim(p_from_name), ''), nullif(lower(trim(p_from_email)), ''),
          nullif(trim(p_subject), ''), p_body, nullif(trim(p_message_id), ''))
  on conflict (organisation_id, message_id) where message_id is not null do nothing
  returning id into v_id;
  return v_id;  -- null when this delivery was a duplicate
end $$;

-- What the webhook needs to know to triage: the client's name and whether AI is allowed.
create function pd.inbound_context(p_token text)
returns table (organisation_name text, ai_enabled boolean)
language sql security definer set search_path = pd, pg_temp as $$
  select name, ai_enabled from pd.organisations where inbound_token = p_token
$$;

create function pd.set_inbox_triage(p_token text, p_item_id uuid, p_triage jsonb) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
begin
  update pd.inbox_items i
     set triage = p_triage
    from pd.organisations o
   where i.id = p_item_id and o.id = i.organisation_id and o.inbound_token = p_token and i.status = 'new';
  if not found then
    raise exception 'No such item for that forwarding address' using errcode = 'no_data_found';
  end if;
end $$;

revoke execute on function pd.accept_inbox_item(uuid, text, date, text, text, text, boolean) from public, anon;
revoke execute on function pd.decline_inbox_item(uuid, text) from public, anon;
grant execute on function pd.accept_inbox_item(uuid, text, date, text, text, text, boolean) to authenticated;
grant execute on function pd.decline_inbox_item(uuid, text) to authenticated;
-- The webhook calls these with the publishable key, so the anonymous role may run them.
-- Usage on the schema lets anon resolve the function names; it still has no table grants,
-- and row-level security applies to everything else.
grant usage on schema pd to anon;
revoke execute on function pd.receive_inbound_email(text, text, text, text, text, text) from public;
revoke execute on function pd.set_inbox_triage(text, uuid, jsonb) from public;
revoke execute on function pd.inbound_context(text) from public;
grant execute on function pd.receive_inbound_email(text, text, text, text, text, text) to anon, authenticated;
grant execute on function pd.set_inbox_triage(text, uuid, jsonb) to anon, authenticated;
grant execute on function pd.inbound_context(text) to anon, authenticated;
