-- Privacy Desk: let signed-in users reach the pd schema through the Supabase Data API.
--
-- 0001 created the schema with row-level security but no grants, so the API roles could
-- not see it at all. This gives the `authenticated` role table access; RLS policies then
-- decide which rows each user may read or change. The `anon` role gets nothing: the public
-- form (slice 5) will write through a server route, never straight from the browser.
--
-- Also needed, in the dashboard: Project Settings > Data API > Exposed schemas: add `pd`.

grant usage on schema pd to authenticated;
grant select, insert, update, delete on all tables in schema pd to authenticated;
grant execute on all functions in schema pd to authenticated;

-- Retention deletes data. Only the service role (nightly job) may run it.
revoke execute on function pd.apply_retention() from public, anon, authenticated;

-- Tables and functions added later get the same grants without a new migration.
alter default privileges in schema pd grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema pd grant execute on functions to authenticated;
