create table if not exists public.user_room_profiles (
  id bigserial primary key,
  user_id bigint not null references public.user_accounts(id) on delete cascade,
  label text not null default 'My Space',
  space_type text null,
  room_personality text not null default '',
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_room_profiles_space_type_check
    check (
      space_type is null
      or space_type in ('bedroom', 'workspace', 'living_room', 'studio', 'gaming_setup')
    )
);

create index if not exists user_room_profiles_user_id_idx
  on public.user_room_profiles(user_id, updated_at desc);

alter table if exists public.analytics_events
  drop constraint if exists analytics_events_event_type_check;

alter table if exists public.analytics_events
  add constraint analytics_events_event_type_check
  check (
    event_type in (
      'artwork_view',
      'artwork_click',
      'product_open',
      'instagram_click',
      'commission_open',
      'search_query',
      'checkout_started',
      'order_completed',
      'recommendation_shown',
      'recommendation_clicked',
      'recommendation_saved',
      'recommendation_ignored',
      'recommendation_purchased',
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
    )
  );

alter table if exists public.visitor_events
  drop constraint if exists visitor_events_event_type_check;

alter table if exists public.visitor_events
  add constraint visitor_events_event_type_check
  check (
    event_type in (
      'artwork_view',
      'artwork_click',
      'product_open',
      'instagram_click',
      'commission_open',
      'search_query',
      'checkout_started',
      'order_completed',
      'recommendation_shown',
      'recommendation_clicked',
      'recommendation_saved',
      'recommendation_ignored',
      'recommendation_purchased',
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
    )
  );
