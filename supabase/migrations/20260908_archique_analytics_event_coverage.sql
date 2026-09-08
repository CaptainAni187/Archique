-- Let the database accept every event the application actually sends.
--
-- `SUPPORTED_BEHAVIOR_EVENTS` (shared/ai/core/config/weights.js) is what the
-- API validates against, and these two CHECK constraints are what the database
-- accepts. They had drifted: hover_dwell, repeat_views, combo_click and
-- purchase passed validation and were then rejected on insert.
--
-- That was not a partial loss. analytics_events is the first write in
-- logAnalyticsEvent, so a rejected row there threw before the session, the
-- visitor event and the taste profile were touched — every combo click the
-- storefront reported was discarded whole, leaving no trace anywhere.
--
-- Also adds the four events introduced alongside this migration: cart adds and
-- removals (the funnel previously jumped straight from viewing to checkout),
-- searches that returned nothing, and scroll depth on the store page.
--
-- tests/analytics-event-coverage.test.js compares this list against the
-- application's, so the two cannot drift apart again unnoticed.

do $$
declare
  allowed text[] := array[
    'artwork_view',
    'artwork_click',
    'product_open',
    'hover_dwell',
    'repeat_views',
    'instagram_click',
    'commission_open',
    'search_query',
    'search_no_results',
    'scroll_depth',
    'combo_click',
    'cart_add',
    'cart_removed',
    'checkout_started',
    'order_completed',
    'purchase',
    'recommendation_shown',
    'recommendation_clicked',
    'recommendation_saved',
    'recommendation_purchased',
    'recommendation_ignored',
    'recommendation_revisited',
    'favorite_added',
    'favorite_removed',
    'room_upload',
    'room_analysis_completed',
    'room_personality_detected',
    'room_match_clicked',
    'room_preview_opened',
    'room_profile_saved',
    'room_set_clicked'
  ];
  list text := (select string_agg(quote_literal(value), ', ') from unnest(allowed) as value);
begin
  -- Both tables take the same list; keeping them in one place is what stops
  -- one being widened and the other forgotten, which is how this broke.
  execute 'alter table public.visitor_events drop constraint if exists visitor_events_event_type_check';
  execute format(
    'alter table public.visitor_events add constraint visitor_events_event_type_check check (event_type in (%s))',
    list
  );

  execute 'alter table public.analytics_events drop constraint if exists analytics_events_event_type_check';
  execute format(
    'alter table public.analytics_events add constraint analytics_events_event_type_check check (event_type in (%s))',
    list
  );
end $$;
