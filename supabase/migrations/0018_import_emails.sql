-- Privacy Desk: importing saved emails into the inbox.
--
-- A consultant often has several requests sitting in their own mailbox. Pasting them one at
-- a time loses two facts that matter: when the email actually arrived (the clock runs from
-- that day, not from the day it was typed in) and which email it was (so the same file
-- imported twice does not become two inbox items).
--
-- pd.add_inbox_item therefore takes three more optional values:
--   p_received_at  when the message arrived; never in the future. Left out, it is now.
--   p_message_id   the email's own id; a second item with the same id for the same client
--                  is not stored, and the function returns null.
--   p_channel      'paste' (the default, as before) or 'email' for an imported email.
-- Calls that pass only the first six values behave exactly as they did.

drop function pd.add_inbox_item(uuid, text, text, text, text, jsonb);
create function pd.add_inbox_item(
  p_organisation_id uuid,
  p_body            text,
  p_from_name       text        default null,
  p_from_email      text        default null,
  p_subject         text        default null,
  p_triage          jsonb       default null,
  p_received_at     timestamptz default null,
  p_message_id      text        default null,
  p_channel         text        default 'paste'
) returns uuid
language plpgsql security definer set search_path = pd, pg_temp as $$
declare
  v_id   uuid;
  v_body text := trim(coalesce(p_body, ''));
begin
  if pd.current_user_id() is null or not pd.can_write_org(p_organisation_id) then
    raise exception 'You cannot add inbox items for this client' using errcode = 'insufficient_privilege';
  end if;
  if length(v_body) < 10 or length(v_body) > 50000 then
    raise exception 'Paste the message: at least a sentence, at most 50,000 characters' using errcode = 'check_violation';
  end if;
  if p_channel is null or p_channel not in ('paste', 'email') then
    raise exception 'An inbox item added by hand is pasted or an imported email' using errcode = 'check_violation';
  end if;
  -- A few minutes' grace for a sender's clock running fast; anything later is a mistake.
  if p_received_at > now() + interval '5 minutes' then
    raise exception 'The message cannot have arrived in the future' using errcode = 'check_violation';
  end if;

  insert into pd.inbox_items (organisation_id, channel, from_name, from_email, subject, body, triage, received_at, message_id)
  values (p_organisation_id, p_channel, nullif(trim(p_from_name), ''), nullif(lower(trim(p_from_email)), ''),
          nullif(trim(p_subject), ''), v_body, p_triage, least(coalesce(p_received_at, now()), now()),
          nullif(trim(p_message_id), ''))
  on conflict (organisation_id, message_id) where message_id is not null do nothing
  returning id into v_id;
  return v_id;  -- null when this email is already in the client's inbox
end $$;

revoke execute on function pd.add_inbox_item(uuid, text, text, text, text, jsonb, timestamptz, text, text) from public, anon;
grant execute on function pd.add_inbox_item(uuid, text, text, text, text, jsonb, timestamptz, text, text) to authenticated;
