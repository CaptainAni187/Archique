import { getDeliveryDetails } from './delivery.js'

function normalizeTag(tag) {
  return typeof tag === 'string' ? tag.trim().toLowerCase() : ''
}

export function normalizeArtworkTags(tags = []) {
  if (!Array.isArray(tags)) {
    return []
  }

  return tags
    .map(normalizeTag)
    .filter((tag, index, collection) => tag && collection.indexOf(tag) === index)
}

export function normalizeArtworkCategory(category = '') {
  const normalized = String(category || '').trim().toLowerCase()
  return normalized === 'sketch' ? 'sketch' : 'canvas'
}

export function isArtworkAvailable(artwork) {
  return Boolean(artwork) && artwork.status !== 'sold' && Number(artwork.quantity) > 0
}

export function mergeUniqueArtworks(artworks = []) {
  const seenIds = new Set()

  return artworks.filter((artwork) => {
    const id = Number(artwork?.id)
    if (!Number.isInteger(id) || seenIds.has(id)) {
      return false
    }

    seenIds.add(id)
    return true
  })
}

export function createArtworkSetKey(artworkIds = []) {
  return [...new Set(artworkIds.map((artworkId) => Number(artworkId)).filter(Number.isInteger))]
    .sort((left, right) => left - right)
    .join(':')
}

export function getArtworkSimilarityScore(leftArtwork, rightArtwork) {
  if (!leftArtwork || !rightArtwork || Number(leftArtwork.id) === Number(rightArtwork.id)) {
    return 0
  }

  const leftTags = normalizeArtworkTags(leftArtwork.tags)
  const rightTags = normalizeArtworkTags(rightArtwork.tags)
  const sharedTags = leftTags.filter((tag) => rightTags.includes(tag))
  const sameCategory =
    normalizeArtworkCategory(leftArtwork.category) === normalizeArtworkCategory(rightArtwork.category)
  const leftPrice = Number(leftArtwork.price || 0)
  const rightPrice = Number(rightArtwork.price || 0)
  const maxPrice = Math.max(leftPrice, rightPrice, 1)
  const priceProximity = 1 - Math.min(1, Math.abs(leftPrice - rightPrice) / maxPrice)
  const mediumMatch =
    String(leftArtwork.medium || '').trim().toLowerCase() &&
    String(leftArtwork.medium || '').trim().toLowerCase() ===
      String(rightArtwork.medium || '').trim().toLowerCase()

  return Number(
    (
      (sameCategory ? 2 : 0) +
      Math.min(3, sharedTags.length * 1.15) +
      (mediumMatch ? 0.5 : 0) +
      priceProximity
    ).toFixed(3),
  )
}

export function isDynamicDiscountEligible(artworks = []) {
  const uniqueArtworks = mergeUniqueArtworks(artworks)

  if (uniqueArtworks.length < 2) {
    return false
  }

  const pairScores = []
  for (let index = 0; index < uniqueArtworks.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < uniqueArtworks.length; compareIndex += 1) {
      pairScores.push(getArtworkSimilarityScore(uniqueArtworks[index], uniqueArtworks[compareIndex]))
    }
  }

  if (pairScores.length === 0) {
    return false
  }

  const averageScore = pairScores.reduce((sum, score) => sum + score, 0) / pairScores.length
  const maxScore = Math.max(...pairScores)

  return maxScore >= 2.4 || averageScore >= 2
}

export function getDynamicDiscountPercent(artworks = []) {
  const uniqueArtworks = mergeUniqueArtworks(artworks)

  if (!isDynamicDiscountEligible(uniqueArtworks)) {
    return 0
  }

  if (uniqueArtworks.length >= 3) {
    return 15
  }

  if (uniqueArtworks.length === 2) {
    return 10
  }

  return 0
}

/**
 * @param {object} options
 * @param {Record<string, number>} [options.shippingRates] admin-configured
 *   shipping rates by category; falls back to defaults when omitted.
 * @param {{type: 'percent'|'flat', value: number, code: string}} [options.coupon]
 *   a pre-validated coupon to apply on top of any curated/dynamic discount.
 */
export function calculateComboPricing(artworks = [], options = {}) {
  const uniqueArtworks = mergeUniqueArtworks(artworks)
  const subtotal = uniqueArtworks.reduce((sum, artwork) => sum + Number(artwork?.price || 0), 0)
  const shippingCost = uniqueArtworks.reduce(
    (sum, artwork) => sum + Number(getDeliveryDetails(artwork, options.shippingRates).shippingCost || 0),
    0,
  )

  const curatedDiscountPercent = Number(options.curatedDiscountPercent || 0)
  const dynamicDiscountPercent =
    curatedDiscountPercent > 0 ? 0 : getDynamicDiscountPercent(uniqueArtworks)
  const discountPercent = curatedDiscountPercent > 0 ? curatedDiscountPercent : dynamicDiscountPercent
  const discountAmount = Number(((subtotal * discountPercent) / 100).toFixed(2))

  const remainingAfterDiscount = Math.max(0, subtotal - discountAmount)
  let couponDiscountAmount = 0
  const coupon = options.coupon || null
  if (coupon) {
    const rawCouponDiscount =
      coupon.type === 'percent'
        ? (remainingAfterDiscount * Number(coupon.value || 0)) / 100
        : Number(coupon.value || 0)
    couponDiscountAmount = Number(
      Math.min(Math.max(rawCouponDiscount, 0), remainingAfterDiscount).toFixed(2),
    )
  }

  const discountedSubtotal = Number((remainingAfterDiscount - couponDiscountAmount).toFixed(2))
  const totalAmount = Number((discountedSubtotal + shippingCost).toFixed(2))

  return {
    items: uniqueArtworks,
    subtotal,
    shippingCost,
    discountPercent,
    discountAmount,
    couponCode: coupon?.code || null,
    couponDiscountAmount,
    discountedSubtotal,
    totalAmount,
    // Full payment is collected upfront — nothing is owed on delivery.
    advanceAmount: totalAmount,
    remainingAmount: 0,
    source:
      curatedDiscountPercent > 0
        ? 'curated-combo'
        : dynamicDiscountPercent > 0
          ? 'dynamic-pairing'
          : 'standard',
  }
}

export function hydrateCombo(combo, artworks = []) {
  const artworksById = new Map(artworks.map((artwork) => [Number(artwork.id), artwork]))
  const itemIds = Array.isArray(combo?.artwork_ids) ? combo.artwork_ids.map(Number) : []
  const items = itemIds.map((artworkId) => artworksById.get(artworkId)).filter(Boolean)

  return {
    ...combo,
    artwork_ids: itemIds,
    items,
    isAvailable: items.length === itemIds.length && items.every(isArtworkAvailable),
    pricing: calculateComboPricing(items, {
      curatedDiscountPercent: Number(combo?.discount_percent || 0),
    }),
  }
}

export function getActiveCombosForArtwork(combos = [], artwork, artworks = []) {
  const artworkId = Number(artwork?.id)
  if (!Number.isInteger(artworkId)) {
    return []
  }

  return combos
    .filter((combo) => combo?.is_active !== false)
    .map((combo) => hydrateCombo(combo, artworks))
    .filter(
      (combo) =>
        combo.isAvailable &&
        combo.artwork_ids.includes(artworkId) &&
        combo.items.some((item) => Number(item.id) !== artworkId),
    )
}

export function getSmartPairings(artwork, artworks = [], limit = 3) {
  if (!artwork) {
    return []
  }

  return mergeUniqueArtworks(artworks)
    .filter((candidate) => Number(candidate.id) !== Number(artwork.id) && isArtworkAvailable(candidate))
    .map((candidate) => ({
      artwork: candidate,
      similarityScore: getArtworkSimilarityScore(artwork, candidate),
      pricing: calculateComboPricing([artwork, candidate]),
    }))
    .filter((candidate) => candidate.similarityScore >= 2.2 && candidate.pricing.discountPercent >= 10)
    .sort(
      (left, right) =>
        right.similarityScore - left.similarityScore ||
        Number(left.artwork.id) - Number(right.artwork.id),
    )
    .slice(0, limit)
}

export function buildPurchaseSelection(items = [], options = {}) {
  const uniqueItems = mergeUniqueArtworks(items)
  const comboId = options.comboId || null
  const comboTitle = options.comboTitle || ''
  const curatedDiscountPercent = Number(options.curatedDiscountPercent || 0)
  const pricing = calculateComboPricing(uniqueItems, {
    curatedDiscountPercent,
    shippingRates: options.shippingRates,
    coupon: options.coupon,
  })

  return {
    type:
      uniqueItems.length <= 1 ? 'single' : comboId ? 'combo' : options.type || 'smart-pair',
    items: uniqueItems,
    primaryItem: uniqueItems[0] || null,
    comboId,
    comboTitle,
    curatedDiscountPercent,
    pricing,
    title:
      comboTitle ||
      (uniqueItems.length === 1
        ? uniqueItems[0]?.title || ''
        : uniqueItems.map((item) => item.title).join(' + ')),
  }
}
