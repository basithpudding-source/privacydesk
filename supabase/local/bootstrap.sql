-- What a Supabase project already has before the first migration runs, reduced to what the
-- migrations and tests use: the three API roles, the sign-in system's table of people (only
-- the columns the schema reads), and gen_random_bytes, which Supabase gets from pgcrypto.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
grant usage on schema auth to service_role;
create or replace function public.gen_random_bytes(n int) returns bytea language sql volatile as
$$ select decode(string_agg(lpad(to_hex((random()*255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
