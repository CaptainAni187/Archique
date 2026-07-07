import { getBackendConfig, requireConfigValues } from './env.js'

function createSupabaseError(payload, status) {
  const message =
    payload?.message || payload?.error || payload?.details || 'Supabase request failed.'
  const error = new Error(message)
  error.code = payload?.code || null
  error.status = status
  error.details = payload?.details || null
  return error
}

export async function supabaseAdminRequest(path, options = {}) {
  const config = getBackendConfig()

  requireConfigValues({
    SUPABASE_URL: config.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: config.supabaseServiceRoleKey,
  })

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw createSupabaseError(payload, response.status)
  }

  return payload
}

export async function fetchArtworkById(productId) {
  const response = await supabaseAdminRequest(
    `artworks?select=*&id=eq.${Number(productId)}&limit=1`,
  )

  return response?.[0] || null
}

export async function fetchArtworks() {
  return supabaseAdminRequest('artworks?select=*&order=id.asc')
}

export async function fetchRecentArtworks(limit = 120) {
  return supabaseAdminRequest(`artworks?select=*&order=id.desc&limit=${Number(limit)}`)
}

export async function fetchCombos() {
  return supabaseAdminRequest('combos?select=*&order=created_at.desc')
}

export async function fetchTagRegistry({ query = '', type = '', onlyActive = true, limit = 200 } = {}) {
  const filters = ['select=*', 'order=usage_count.desc', `limit=${Number(limit)}`]
  if (onlyActive) {
    filters.push('is_active=eq.true')
  }
  if (type) {
    filters.push(`type=eq.${encodeURIComponent(String(type).trim())}`)
  }
  if (query) {
    filters.push(`name=ilike.*${encodeURIComponent(String(query).trim())}*`)
  }
  return supabaseAdminRequest(`tag_registry?${filters.join('&')}`)
}

export async function fetchTagAliases() {
  return supabaseAdminRequest(
    'tag_aliases?select=id,alias,canonical_tag_id,created_at&order=created_at.desc',
  )
}

export async function fetchTagByName(name) {
  const response = await supabaseAdminRequest(
    `tag_registry?select=*&name=eq.${encodeURIComponent(String(name || '').trim().toLowerCase())}&limit=1`,
  )
  return response?.[0] || null
}

export async function createTagRegistryEntry(payload) {
  const response = await supabaseAdminRequest('tag_registry', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  return response?.[0] || null
}

export async function updateTagRegistryEntryById(id, payload) {
  const response = await supabaseAdminRequest(`tag_registry?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  return response?.[0] || null
}

export async function createTagAlias(payload) {
  const response = await supabaseAdminRequest('tag_aliases', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  return response?.[0] || null
}

export async function deleteTagAliasById(id) {
  await supabaseAdminRequest(`tag_aliases?id=eq.${Number(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })
}

export async function upsertAdminAiFeedback(payload) {
  const response = await supabaseAdminRequest(
    'admin_ai_feedback?on_conflict=feedback_type,source,signal_key',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    },
  )
  return response?.[0] || null
}

export async function fetchAdminAiFeedback(limit = 500) {
  return supabaseAdminRequest(
    `admin_ai_feedback?select=*&order=updated_at.desc&limit=${Number(limit)}`,
  )
}

export async function fetchComboById(id) {
  const response = await supabaseAdminRequest(`combos?select=*&id=eq.${encodeURIComponent(String(id))}&limit=1`)
  return response?.[0] || null
}

export async function createCombo(payload) {
  const response = await supabaseAdminRequest('combos', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function updateComboById(id, payload) {
  const response = await supabaseAdminRequest(`combos?id=eq.${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function deleteComboById(id) {
  await supabaseAdminRequest(`combos?id=eq.${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })

  return { id: String(id) }
}

export async function createArtwork(payload) {
  const response = await supabaseAdminRequest('artworks', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function updateArtwork(id, payload) {
  const response = await supabaseAdminRequest(`artworks?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function decrementArtworkStock(artwork) {
  const currentQuantity = Number.isFinite(Number(artwork.quantity))
    ? Number(artwork.quantity)
    : 1
  const nextQuantity = Math.max(0, currentQuantity - 1)

  return updateArtwork(artwork.id, {
    quantity: nextQuantity,
    status: nextQuantity <= 0 ? 'sold' : artwork.status || 'available',
  })
}

export async function deleteArtwork(id) {
  await supabaseAdminRequest(`artworks?id=eq.${Number(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })

  return { id: Number(id) }
}

export async function fetchOrderByPaymentId(razorpayPaymentId) {
  const encodedPaymentId = encodeURIComponent(razorpayPaymentId)
  const response = await supabaseAdminRequest(
    `orders?select=*&razorpay_payment_id=eq.${encodedPaymentId}&limit=1`,
  )

  return response?.[0] || null
}

export async function fetchOrderById(orderId) {
  const response = await supabaseAdminRequest(
    `orders?select=*&id=eq.${Number(orderId)}&limit=1`,
  )

  return response?.[0] || null
}

export async function fetchOrderByCode(orderCode) {
  const encodedOrderCode = encodeURIComponent(orderCode)
  const response = await supabaseAdminRequest(
    `orders?select=*&order_code=eq.${encodedOrderCode}&limit=1`,
  )

  return response?.[0] || null
}

export async function fetchLatestOrderCodes(limit = 20) {
  return supabaseAdminRequest(
    `orders?select=order_code&order=id.desc&limit=${Number(limit)}`,
  )
}

export async function fetchOrders() {
  return supabaseAdminRequest('orders?select=*&order=id.desc')
}

export async function fetchOrdersByCustomerEmail(email) {
  const encodedEmail = encodeURIComponent(String(email || '').trim().toLowerCase())
  return supabaseAdminRequest(
    `orders?select=*&customer_email=eq.${encodedEmail}&order=id.desc`,
  )
}

export async function fetchOrderAnalyticsRows() {
  return supabaseAdminRequest(
    'orders?select=id,product_id,total_amount,advance_amount,payment_status,created_at&order=created_at.desc',
  )
}

export async function updateOrderById(id, payload) {
  const response = await supabaseAdminRequest(`orders?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function fetchCommissions() {
  return supabaseAdminRequest('commissions?select=*&order=id.desc')
}

export async function fetchCommissionById(id) {
  const response = await supabaseAdminRequest(
    `commissions?select=*&id=eq.${Number(id)}&limit=1`,
  )

  return response?.[0] || null
}

export async function createCommission(payload) {
  const response = await supabaseAdminRequest('commissions', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function updateCommissionById(id, payload) {
  const response = await supabaseAdminRequest(`commissions?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function fetchUserByEmail(email) {
  const encodedEmail = encodeURIComponent(String(email || '').trim().toLowerCase())
  const response = await supabaseAdminRequest(
    `user_accounts?select=*&email=eq.${encodedEmail}&limit=1`,
  )

  return response?.[0] || null
}

export async function fetchUserByGoogleId(googleId) {
  const encodedGoogleId = encodeURIComponent(String(googleId || '').trim())
  const response = await supabaseAdminRequest(
    `user_accounts?select=*&google_id=eq.${encodedGoogleId}&limit=1`,
  )

  return response?.[0] || null
}

export async function fetchUserById(userId) {
  const response = await supabaseAdminRequest(`user_accounts?select=*&id=eq.${Number(userId)}&limit=1`)
  return response?.[0] || null
}

export async function createUserAccount(payload) {
  const response = await supabaseAdminRequest('user_accounts', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function updateUserAccountById(id, payload) {
  const response = await supabaseAdminRequest(`user_accounts?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function deleteUserAccountById(id) {
  await supabaseAdminRequest(`user_accounts?id=eq.${Number(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })
}

export async function createUserLoginEvent(payload) {
  const response = await supabaseAdminRequest('user_login_events', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function fetchRecentVisitorEventsByUserId(userId, limit = 100) {
  return supabaseAdminRequest(
    `visitor_events?select=event_type,artwork_id,path,metadata,created_at&user_id=eq.${Number(
      userId,
    )}&order=created_at.desc&limit=${Number(limit)}`,
  )
}

export async function fetchUserSavedArtworksByUserId(userId) {
  return supabaseAdminRequest(
    `user_saved_artworks?select=id,artwork_id,created_at&user_id=eq.${Number(
      userId,
    )}&order=created_at.desc`,
  )
}

export async function fetchUserSavedArtworkByArtworkId(userId, artworkId) {
  const response = await supabaseAdminRequest(
    `user_saved_artworks?select=*&user_id=eq.${Number(userId)}&artwork_id=eq.${Number(artworkId)}&limit=1`,
  )
  return response?.[0] || null
}

export async function createUserSavedArtwork(payload) {
  const response = await supabaseAdminRequest('user_saved_artworks', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  return response?.[0] || null
}

export async function deleteUserSavedArtworkById(id) {
  await supabaseAdminRequest(`user_saved_artworks?id=eq.${Number(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })
}

export async function fetchUserCollectionsByUserId(userId) {
  return supabaseAdminRequest(
    `user_collections?select=id,name,created_at&user_id=eq.${Number(userId)}&order=created_at.desc`,
  )
}

export async function createUserCollection(payload) {
  const response = await supabaseAdminRequest('user_collections', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  return response?.[0] || null
}

export async function deleteUserCollectionById(id) {
  await supabaseAdminRequest(`user_collections?id=eq.${Number(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })
}

export async function fetchUserCollectionArtworksByCollectionId(collectionId) {
  return supabaseAdminRequest(
    `user_collection_artworks?select=id,collection_id,artwork_id,combo_id,created_at&collection_id=eq.${Number(
      collectionId,
    )}&order=created_at.desc`,
  )
}

export async function createUserCollectionArtwork(payload) {
  const response = await supabaseAdminRequest('user_collection_artworks', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  return response?.[0] || null
}

export async function deleteUserCollectionArtworkById(id) {
  await supabaseAdminRequest(`user_collection_artworks?id=eq.${Number(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })
}

export async function fetchVisibleTestimonials() {
  return supabaseAdminRequest(
    'testimonials?select=*&is_visible=eq.true&order=created_at.desc&limit=6',
  )
}

export async function createTestimonial(payload) {
  const response = await supabaseAdminRequest('testimonials', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function fetchAdminByEmail(email) {
  const encodedEmail = encodeURIComponent(String(email || '').trim().toLowerCase())
  const response = await supabaseAdminRequest(
    `admins?select=*&email=eq.${encodedEmail}&limit=1`,
  )

  return response?.[0] || null
}

export async function fetchAdminById(id) {
  const response = await supabaseAdminRequest(
    `admins?select=*&id=eq.${Number(id)}&limit=1`,
  )

  return response?.[0] || null
}

export async function updateAdminPasswordHash(id, passwordHash) {
  const response = await supabaseAdminRequest(`admins?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    }),
  })

  return response?.[0] || null
}

export async function createAdminSession(payload) {
  const response = await supabaseAdminRequest('admin_sessions', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function fetchAdminSessionById(id) {
  const response = await supabaseAdminRequest(
    `admin_sessions?select=*&id=eq.${Number(id)}&limit=1`,
  )

  return response?.[0] || null
}

export async function updateAdminSessionById(id, payload) {
  const response = await supabaseAdminRequest(`admin_sessions?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function createAdminActivityLog(payload) {
  const response = await supabaseAdminRequest('admin_activity_logs', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function fetchAdminActivityLogs(limit = 50) {
  return supabaseAdminRequest(
    `admin_activity_logs?select=*&order=created_at.desc&limit=${Number(limit)}`,
  )
}

export async function upsertVisitorSession(payload) {
  const response = await supabaseAdminRequest('visitor_sessions?on_conflict=session_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function createVisitorEvent(payload) {
  const response = await supabaseAdminRequest('visitor_events', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function updateVisitorEventsForSession(sessionId, payload) {
  const encodedSessionId = encodeURIComponent(String(sessionId || '').trim())
  const response = await supabaseAdminRequest(`visitor_events?session_id=eq.${encodedSessionId}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response || []
}

export async function fetchVisitorTasteProfileBySessionId(sessionId) {
  const encodedSessionId = encodeURIComponent(String(sessionId || '').trim())
  const response = await supabaseAdminRequest(
    `visitor_taste_profiles?select=*&session_id=eq.${encodedSessionId}&limit=1`,
  )

  return response?.[0] || null
}

export async function upsertVisitorTasteProfile(payload) {
  const response = await supabaseAdminRequest('visitor_taste_profiles?on_conflict=session_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function fetchUserTasteProfileByUserId(userId) {
  const response = await supabaseAdminRequest(
    `user_taste_profiles?select=*&user_id=eq.${Number(userId)}&limit=1`,
  )

  return response?.[0] || null
}

export async function upsertUserTasteProfile(payload) {
  const response = await supabaseAdminRequest('user_taste_profiles?on_conflict=user_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

export async function fetchVisitorEvents(limit = 500) {
  return supabaseAdminRequest(
    `visitor_events?select=event_type,metadata,created_at&order=created_at.desc&limit=${Number(limit)}`,
  )
}

export async function fetchUserAccounts() {
  return supabaseAdminRequest(
    'user_accounts?select=id,name,email,avatar_url,created_at,provider,last_login_at,login_count&order=created_at.desc',
  )
}

export async function fetchUserLoginEvents(limit = 1000) {
  return supabaseAdminRequest(
    `user_login_events?select=id,user_id,provider,login_at&order=login_at.desc&limit=${Number(limit)}`,
  )
}

export async function fetchUserRoomProfilesByUserId(userId) {
  return supabaseAdminRequest(
    `user_room_profiles?select=id,label,space_type,room_personality,profile,created_at,updated_at&user_id=eq.${Number(
      userId,
    )}&order=updated_at.desc`,
  )
}

export async function createUserRoomProfile(payload) {
  const response = await supabaseAdminRequest('user_room_profiles', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  return response?.[0] || null
}

export async function deleteUserRoomProfileById(id) {
  await supabaseAdminRequest(`user_room_profiles?id=eq.${Number(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })
}
