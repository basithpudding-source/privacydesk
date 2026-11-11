-- Privacy Desk: a client organisation cannot be deleted through the API.
--
-- The orgs_admin policy was "for all", so a partner admin could delete a client with one
-- Data API call. The delete cascades to every case, clock pause, inbox item and audit event
-- of that client, and leaves no record that it happened. The app has never offered this;
-- only a direct call could do it.
--
-- Admins keep adding and editing clients. Removing a client and its records is now a job for
-- the database owner, deliberately and by hand, until there is an audited way to offboard a
-- client (an open question in docs/DECISIONS.md).

drop policy orgs_admin on pd.organisations;
create policy orgs_insert on pd.organisations for insert
  with check (pd.is_partner_admin(partner_id));
create policy orgs_update on pd.organisations for update
  using (pd.is_partner_admin(partner_id)) with check (pd.is_partner_admin(partner_id));

revoke delete on pd.organisations from authenticated;
-- Consultancies were never deletable (pd.partners has no delete policy); make that a grant too.
revoke delete on pd.partners from authenticated;
