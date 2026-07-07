export const SUPPORTED_BEHAVIOR_EVENTS = [
  'artwork_view',
  'artwork_click',
  'product_open',
  'hover_dwell',
  'repeat_views',
  'instagram_click',
  'commission_open',
  'search_query',
  'combo_click',
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
  'room_set_clicked',
]

export const EVENT_WEIGHTS = {
  artwork_view: 1,
  artwork_click: 2,
  product_open: 3,
  hover_dwell: 1.25,
  repeat_views: 2,
  instagram_click: 2,
  commission_open: 2,
  search_query: 1.5,
  combo_click: 2,
  checkout_started: 2.5,
  order_completed: 4,
  purchase: 4,
  recommendation_shown: 0.6,
  recommendation_clicked: 1.8,
  recommendation_saved: 2.9,
  recommendation_purchased: 3.5,
  recommendation_ignored: 0.15,
  recommendation_revisited: 2.2,
  favorite_added: 2.4,
  favorite_removed: -0.6,
  room_upload: 1.2,
  room_analysis_completed: 1.4,
  room_personality_detected: 1,
  room_match_clicked: 2,
  room_preview_opened: 1.6,
  room_profile_saved: 2.8,
  room_set_clicked: 2.2,
}

export const DEFAULT_RANKING_WEIGHTS = {
  semantic_similarity: 0.3,
  taste_alignment: 0.25,
  mood_similarity: 0.15,
  visual_similarity: 0.1,
  price_affinity: 0.1,
  diversity_boost: 0.05,
  freshness_boost: 0.05,
}

export const SEARCH_INTENT_RANKING_WEIGHTS = {
  ...DEFAULT_RANKING_WEIGHTS,
  semantic_similarity: 0.38,
  taste_alignment: 0.12,
  mood_similarity: 0.22,
  price_affinity: 0.12,
}

export const PRICE_BUCKETS = [
  { label: 'entry', max: 2500 },
  { label: 'accessible', max: 5000 },
  { label: 'collector', max: 10000 },
  { label: 'premium', max: Infinity },
]

export function getPriceBucket(price) {
  const numericPrice = Number(price)
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return 'unknown'
  }

  return PRICE_BUCKETS.find((bucket) => numericPrice <= bucket.max)?.label || 'premium'
}
