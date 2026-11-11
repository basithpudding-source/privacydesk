-- Privacy Desk: only the app's server may write inbound email.
--
-- The inbound functions were keyed by the client's forwarding token alone and callable by the
-- anonymous role with the publishable key. The token is part of the forwarding address, so
-- anyone who has seen that address (it travels in mail headers) could call
-- pd.receive_inbound_email directly and put messages in the client's inbox, skipping the
-- webhook's own secret; pd.set_inbox_triage would then let them write the "AI" proposal shown
-- beside it.
--
-- As for the public form (0010), these functions now also need a server key: a long random
-- value the app's server holds in INBOUND_SERVER_KEY and the database holds only as a hash.
-- The forwarding token still says which client the message is for; the key says the call came
-- from the webhook.
--
-- After running this file, set the key once (SQL editor), with the same value as the app's
-- INBOUND_SERVER_KEY:
--   select pd.set_server_key('inbound_email', '<the value of INBOUND_SERVER_KEY>');
-- Until then inbound email is refused, and Postmark keeps retrying it.

drop function pd.receive_inbound_email(text, text, text, text, text, text);
create function pd.receive_inbound_email(
  p_token      text,
  p_from_name  text,
  p_from_email text,
  p_subject    text,
  p_body       text,
  p_message_id text default null,
  p_server_key text default null
) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  perform pd.require_server_key('inbound_email', p_server_key);

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

drop function pd.inbound_context(text);
create function pd.inbound_context(p_token text, p_server_key text)
returns table (organisation_name text, ai_enabled boolean)
language plpgsql security definer set search_path = pd, pg_temp as $$
begin
  perform pd.require_server_key('inbound_email', p_server_key);
  return query select o.name, o.ai_enabled from pd.organisations o where o.inbound_token = p_token;
end $$;

drop function pd.set_inbox_triage(text, uuid, jsonb);
create function pd.set_inbox_triage(p_token text, p_item_id uuid, p_triage jsonb, p_server_key text) returns void
language plpgsql security definer set search_path = pd, pg_temp as $$
begin
  perform pd.require_server_key('inbound_email', p_server_key);

  update pd.inbox_items i
     set triage = p_triage
    from pd.organisations o
   where i.id = p_item_id and o.id = i.organisation_id and o.inbound_token = p_token and i.status = 'new';
  if not found then
    raise exception 'No such item for that forwarding address' using errcode = 'no_data_found';
  end if;
end $$;

-- The anonymous role may still call them: the webhook has no user session. What it can no
-- longer do is call them usefully without the key.
revoke execute on function pd.receive_inbound_email(text, text, text, text, text, text, text) from public;
revoke execute on function pd.inbound_context(text, text) from public;
revoke execute on function pd.set_inbox_triage(text, uuid, jsonb, text) from public;
grant execute on function pd.receive_inbound_email(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function pd.inbound_context(text, text) to anon, authenticated;
grant execute on function pd.set_inbox_triage(text, uuid, jsonb, text) to anon, authenticated;
