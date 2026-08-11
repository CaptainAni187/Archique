-- Enforce row level security across all application tables.
--
-- Data reaches the client through /api/* handlers that authenticate with the
-- service role key, which bypasses RLS. The browser's supabase-js client is
-- used only for Google OAuth (supabase.auth.*) and issues no PostgREST
-- queries, so no client depends on direct table access.
--
-- The policy denies the anon and authenticated roles outright rather than
-- attempting per-row ownership rules: no client is meant to reach these tables
-- directly at all, so a blanket denial states that intent precisely and leaves
-- no rule to get subtly wrong.

do $$
declare
  target text;
  policy_name text;
begin
  foreach target in array array[
    'admin_ai_feedback',
    'analytics_events',
    'artworks',
    'combos',
    'commissions',
    'orders',
    'payment_logs',
    'tag_aliases',
    'tag_registry',
    'testimonials',
    'user_accounts',
    'user_collection_artworks',
    'user_collections',
    'user_login_events',
    'user_room_profiles',
    'user_saved_artworks',
    'user_taste_profiles',
    'visitor_events',
    'visitor_sessions',
    'visitor_taste_profiles'
  ]
  loop
    if to_regclass('public.' || target) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target);

    policy_name := target || '_service_role_only';
    execute format('drop policy if exists %I on public.%I', policy_name, target);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      policy_name,
      target
    );
  end loop;
end
$$;
