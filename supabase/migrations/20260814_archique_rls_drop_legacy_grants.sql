-- Remove the legacy client-facing grants and deny direct table access.
--
-- Enabling row level security is not sufficient on its own. Earlier migrations
-- left broad policies on several tables granting the anon role read *and*
-- write, for example "allow delete artworks" (DELETE, using true) and
-- "allow update orders" (UPDATE, using true). PostgreSQL combines permissive
-- policies with OR, so adding a deny-all permissive policy alongside them
-- changed nothing: any single permissive policy that matches still grants
-- access.
--
-- Two changes fix that properly:
--
--   1. Every existing policy on public tables is dropped. With RLS enabled and
--      no policies, the anon and authenticated roles have no access at all.
--   2. A RESTRICTIVE deny policy is added. Restrictive policies are combined
--      with AND, so if a permissive policy is ever added again by mistake it
--      cannot re-open the table on its own.
--
-- The service role bypasses RLS entirely, so the /api/* handlers are
-- unaffected. Nothing in the browser queries these tables: supabase-js is used
-- only for Google OAuth, which lives in the auth schema.
--
-- Storage policies are deliberately untouched — public artwork images are
-- served straight from the storage bucket.

do $$
declare
  policy_record record;
  target record;
begin
  -- 1. Drop every policy on every table in the public schema.
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;

  -- 2. Enable RLS and add a restrictive deny for client roles.
  for target in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', target.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      target.relname || '_deny_client_access',
      target.relname
    );
  end loop;
end
$$;
