-- Privacy Desk: an administrator can add a client again.
--
-- Since 0016, "Add client" in the app has been refused with "new row violates row-level
-- security policy". The app adds the row and asks for it back in the same statement, and
-- Postgres then checks the new row against the read rule as well as the insert rule. The one
-- read rule left, orgs_read, looks the client up in the table by its id, and a row that is
-- still being added is not there to be found. Before 0016 the "for all" policy let an
-- administrator read a client by the desk it belongs to, which needs no lookup; 0016 dropped
-- that along with the right to delete.
--
-- This puts the read half back. It shows nobody anything new: orgs_read already lets an
-- administrator with a second factor read every client of their own desk, and this rule
-- names the same people and the same rows.

create policy orgs_admin_read on pd.organisations for select
  using (pd.is_partner_admin(partner_id));
