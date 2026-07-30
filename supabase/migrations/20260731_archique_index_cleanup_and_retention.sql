-- Archique: index cleanup + analytics retention
--
-- 1. Drops genuinely duplicated indexes. Each pair below indexes the same
--    column on the same table under two different names, so every write paid
--    to maintain both while only one was ever used by the planner.
--
-- 2. Adds retention for the event tables. Analytics rows were written on every
--    page view with nothing ever removing them, so the table grew without
--    bound — eventually dominating database size and cost on a small plan.

begin;

-- ── 1. Duplicate indexes ────────────────────────────────────────────────
-- analytics_events(event_type) is covered by analytics_events_event_type_idx.
drop index if exists public.analytics_events_type_idx;

-- combos(is_active) is covered by combos_is_active_idx.
drop index if exists public.combos_active_idx;

-- ── 2. Retention ────────────────────────────────────────────────────────
-- Supports both the retention sweep and the admin dashboard's date filtering.
create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

/**
 * Deletes event rows older than `retention_days`, in bounded batches so the
 * sweep never holds a long lock or blows up the WAL on a large table.
 * Returns the number of rows removed.
 *
 * Run periodically, e.g.:
 *   select public.prune_event_tables(180);
 *
 * If pg_cron is available:
 *   select cron.schedule('archique-prune-events', '0 3 * * 0',
 *                        $$select public.prune_event_tables(180)$$);
 */
create or replace function public.prune_event_tables(retention_days integer default 180)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := timezone('utc', now()) - make_interval(days => retention_days);
  removed bigint := 0;
  batch bigint;
begin
  if retention_days < 30 then
    raise exception 'retention_days must be at least 30 (got %)', retention_days;
  end if;

  loop
    delete from public.analytics_events
    where id in (
      select id from public.analytics_events
      where created_at < cutoff
      limit 5000
    );
    get diagnostics batch = row_count;
    removed := removed + batch;
    exit when batch = 0;
  end loop;

  if to_regclass('public.visitor_events') is not null then
    loop
      delete from public.visitor_events
      where id in (
        select id from public.visitor_events
        where created_at < cutoff
        limit 5000
      );
      get diagnostics batch = row_count;
      removed := removed + batch;
      exit when batch = 0;
    end loop;
  end if;

  return removed;
end;
$$;

revoke all on function public.prune_event_tables(integer) from public, anon, authenticated;

commit;
