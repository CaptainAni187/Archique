// Fallback rates used until the admin-configured values load (or if that
// fetch fails). The authoritative values live in shop_settings.shipping_rates
// and are always what the server charges — these are only a display default.
export const DEFAULT_SHIPPING_RATES = {
  canvas: 1200,
  sketch: 350,
}

const DELIVERY_ESTIMATES = {
  canvas: '5-7 business days',
  sketch: '3-5 business days',
}

function getNormalizedCategory(artwork) {
  const category = String(artwork?.category || '')
    .trim()
    .toLowerCase()

  return category === 'sketch' ? 'sketch' : 'canvas'
}

/**
 * @param {object} artwork
 * @param {Record<string, number>} [shippingRates] admin-configured rates by
 *   category; falls back to DEFAULT_SHIPPING_RATES for any missing category.
 */
export function getDeliveryDetails(artwork, shippingRates = DEFAULT_SHIPPING_RATES) {
  const subtotal = Number(artwork?.price || 0)
  const category = getNormalizedCategory(artwork)
  const shippingCost = Number(
    shippingRates?.[category] ?? DEFAULT_SHIPPING_RATES[category] ?? 0,
  )
  const totalAmount = subtotal + shippingCost

  return {
    category,
    subtotal,
    shippingCost,
    deliveryEstimate: DELIVERY_ESTIMATES[category] || DELIVERY_ESTIMATES.canvas,
    totalAmount,
    // Full payment is collected upfront — nothing is owed on delivery.
    advanceAmount: totalAmount,
    remainingAmount: 0,
  }
}
