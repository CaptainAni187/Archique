import { z } from 'zod'
import { requireAdminAuth } from './_lib/adminSession.js'
import { logAdminActivity } from './_lib/adminActivity.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import {
  buildRecommendationReasons,
  buildTasteVector,
  createEmptyTasteProfile,
  mergeTasteProfileForEvent,
  rankArtworksWithPipeline,
  suggestArtworkTags,
} from '../shared/ai/core/index.js'
import {
  createTagAlias,
  createCombo,
  createArtwork,
  createTagRegistryEntry,
  deleteComboById,
  deleteArtwork,
  fetchAdminAiFeedback,
  fetchComboById,
  fetchCombos,
  fetchArtworkById,
  fetchArtworks,
  fetchRecentArtworks,
  fetchTagAliases,
  fetchTagByName,
  fetchTagRegistry,
  fetchVisitorEvents,
  upsertAdminAiFeedback,
  updateComboById,
  updateArtwork,
  updateTagRegistryEntryById,
} from './_lib/supabaseAdmin.js'
import {
  artworkPayloadSchema,
  comboPayloadSchema,
  sendValidationError,
  validateWithSchema,
} from './_lib/validation.js'
import {
  createArtworkSetKey,
  getActiveCombosForArtwork,
  hydrateCombo,
  mergeUniqueArtworks,
} from '../src/utils/comboPricing.js'

const artworkStatusSchema = z.object({
  status: z.enum(['available', 'sold']),
})

function isMissingCategoryColumn(error) {
  const message = String(error?.message || '')
  return message.includes('column') && message.includes('category') && message.includes('does not exist')
}

function isMissingFeaturedColumn(error) {
  const message = String(error?.message || '')
  return (
    message.includes('column') &&
    message.includes('is_featured') &&
    message.includes('does not exist')
  )
}

function isMissingOptionalArtworkColumn(error) {
  const message = String(error?.message || '')
  return (
    message.includes('column') &&
    ['category', 'is_featured', 'tags', 'instagram_url', 'featured_rank'].some((column) =>
      message.includes(column),
    ) &&
    message.includes('does not exist')
  )
}

function isMissingComboTableError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('relation') && message.includes('combos')
}

function isMissingTagRegistryTable(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('tag_registry') &&
    (message.includes('schema cache') ||
      message.includes('could not find the table') ||
      message.includes('relation') ||
      message.includes('does not exist'))
  )
}

function isReferencedByOrdersError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('foreign key constraint') && message.includes('orders')
}

function withoutOptionalArtworkColumns(payload) {
  const {
    category: _category,
    is_featured: _isFeatured,
    tags: _tags,
    instagram_url: _instagramUrl,
    featured_rank: _featuredRank,
    ...rest
  } = payload

  return rest
}

function normalizeArtwork(artwork) {
  const images = [
    ...(Array.isArray(artwork.images) ? artwork.images : []),
    typeof artwork.image === 'string' ? artwork.image : '',
  ].filter((image, index, collection) => {
    return typeof image === 'string' && image.trim() && collection.indexOf(image) === index
  })

  return {
    ...artwork,
    price: Number(artwork.price),
    images,
    image: images[0] || '',
    is_featured: artwork.is_featured === true,
    medium: artwork.medium || 'Not specified',
    size: artwork.size || 'Not specified',
    quantity: Number.isFinite(Number(artwork.quantity)) ? Number(artwork.quantity) : 1,
    tags: Array.isArray(artwork.tags) ? artwork.tags.filter(Boolean) : [],
    instagram_url: artwork.instagram_url || '',
    featured_rank: Number.isFinite(Number(artwork.featured_rank))
      ? Number(artwork.featured_rank)
      : null,
    status:
      Number(artwork.quantity) <= 0 ? 'sold' : artwork.status || 'available',
    category: artwork.category || '',
  }
}

function withStockStatus(payload) {
  return {
    ...payload,
    status: Number(payload.quantity) <= 0 ? 'sold' : payload.status,
  }
}

function getArtworkId(req) {
  const artworkId = req.query?.id
  return Array.isArray(artworkId) ? Number(artworkId[0]) : Number(artworkId)
}

function getAction(req) {
  return String(req.query?.action || '').trim().toLowerCase()
}
function normalizeTagName(value) {
  return String(value || '').trim().toLowerCase()
}

const TAG_TYPES = ['style', 'mood', 'color', 'subject', 'space', 'energy', 'medium', 'collection']

function inferTagType(tag = '') {
  const value = normalizeTagName(tag)
  const colorTags = ['black', 'white', 'red', 'blue', 'green', 'gold', 'grey', 'gray', 'brown']
  const moodTags = ['calm', 'dark', 'emotional', 'vibrant', 'minimal', 'dramatic', 'serene']
  const spaceTags = ['living-room', 'bedroom', 'gaming-room', 'studio', 'office']
  if (colorTags.includes(value)) return 'color'
  if (moodTags.includes(value)) return 'mood'
  if (spaceTags.includes(value)) return 'space'
  if (value.includes('collection')) return 'collection'
  return 'style'
}

async function registerTags(tags = [], createdBy = 'system') {
  const normalized = Array.from(new Set(tags.map(normalizeTagName).filter(Boolean))).slice(0, 32)
  const rows = []
  try {
    for (const tag of normalized) {
      const existing = await fetchTagByName(tag)
      if (existing) {
        const updated = await updateTagRegistryEntryById(existing.id, {
          usage_count: Number(existing.usage_count || 0) + 1,
          is_active: true,
        })
        rows.push(updated || existing)
        continue
      }
      const created = await createTagRegistryEntry({
        name: tag,
        type: inferTagType(tag),
        usage_count: 1,
        created_by: createdBy,
        is_system: createdBy === 'system',
        is_active: true,
      })
      if (created) {
        rows.push(created)
      }
    }
  } catch (error) {
    // The tag_registry table is optional (added by a later migration). Never
    // let tag bookkeeping block core artwork create/update.
    if (isMissingTagRegistryTable(error)) {
      return rows
    }
    throw error
  }
  return rows
}

function buildArtworkHealthScore({ artwork, duplicateMatches = [], comboMatches = [] }) {
  const tags = Array.isArray(artwork.tags) ? artwork.tags : []
  const hasMood = tags.some((tag) => inferTagType(tag) === 'mood')
  const hasColor = tags.some((tag) => inferTagType(tag) === 'color')
  const hasSpace = tags.some((tag) => inferTagType(tag) === 'space')
  const hasDescription = String(artwork.description || '').trim().length >= 40
  const hasCombos = comboMatches.length > 0
  const duplicateRisk = duplicateMatches.some((item) => Number(item.score || 0) >= 0.9)
  let score = 50
  if (tags.length >= 4) score += 10
  if (hasMood) score += 8
  if (hasColor) score += 8
  if (hasSpace) score += 6
  if (hasDescription) score += 8
  if (hasCombos) score += 6
  if (duplicateRisk) score -= 14
  const suggestions = []
  if (!hasMood) suggestions.push('add mood tags')
  if (!hasColor) suggestions.push('add color tags')
  if (!hasSpace) suggestions.push('add room category tag')
  if (!hasCombos) suggestions.push('low combo compatibility')
  if (!hasDescription) suggestions.push('improve description depth')
  if (duplicateRisk) suggestions.push('possible duplicate image detected')
  return {
    score: Math.max(0, Math.min(100, score)),
    suggestions,
  }
}

function getComboId(req) {
  return String(req.query?.comboId || '').trim()
}

function getQueryArtworkId(req) {
  const artworkId = req.query?.artworkId
  return Array.isArray(artworkId) ? Number(artworkId[0]) : Number(artworkId)
}

function normalizeCombo(combo, artworks = []) {
  const hydrated = hydrateCombo(combo, artworks)

  return {
    ...hydrated,
    discount_percent: Number(combo?.discount_percent || 0),
    is_active: combo?.is_active !== false,
    created_at: combo?.created_at || null,
  }
}

async function readComboContext() {
  const artworks = await fetchArtworks()
  let combos = []

  try {
    combos = await fetchCombos()
  } catch (error) {
    if (!isMissingComboTableError(error)) {
      throw error
    }
  }

  const normalizedArtworks = artworks.map(normalizeArtwork)

  return {
    artworks: normalizedArtworks,
    combos,
  }
}

async function handleFetchArtworks(_req, res) {
  const artworks = await fetchArtworks()
  return sendJson(res, 200, {
    success: true,
    data: artworks.map(normalizeArtwork),
  })
}

async function handleFetchArtwork(req, res) {
  const artworkId = getArtworkId(req)

  if (!Number.isInteger(artworkId) || artworkId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_ARTWORK_ID',
      message: 'A valid artwork id is required.',
    })
  }

  const artwork = await fetchArtworkById(artworkId)
  if (!artwork) {
    return sendJson(res, 404, {
      success: false,
      error: 'ARTWORK_NOT_FOUND',
      message: 'Artwork not found.',
    })
  }

  const normalizedArtwork = normalizeArtwork(artwork)
  let comboMatches = []

  try {
    const { artworks, combos } = await readComboContext()
    comboMatches = getActiveCombosForArtwork(combos, normalizedArtwork, artworks)
  } catch {
    comboMatches = []
  }

  return sendJson(res, 200, {
    success: true,
    data: {
      ...normalizedArtwork,
      combos: comboMatches,
    },
  })
}

async function handleFetchCombos(req, res) {
  const comboId = getComboId(req)
  const artworkId = getQueryArtworkId(req)
  const isAdminView = String(req.query?.admin || '').trim().toLowerCase() === 'true'

  if (isAdminView) {
    const session = await requireAdminAuth(req, res)
    if (!session) {
      return null
    }
  }

  const { artworks, combos } = await readComboContext()
  const normalizedCombos = combos.map((combo) => normalizeCombo(combo, artworks))
  const visibleCombos = isAdminView
    ? normalizedCombos
    : normalizedCombos.filter((combo) => combo.is_active && combo.isAvailable)

  if (comboId) {
    const combo = visibleCombos.find((entry) => entry.id === comboId)
    if (!combo) {
      return sendJson(res, 404, {
        success: false,
        error: 'COMBO_NOT_FOUND',
        message: 'Combo not found.',
      })
    }

    return sendJson(res, 200, {
      success: true,
      data: combo,
    })
  }

  const filteredCombos =
    Number.isInteger(artworkId) && artworkId > 0
      ? visibleCombos.filter((combo) => combo.artwork_ids.includes(artworkId))
      : visibleCombos

  return sendJson(res, 200, {
    success: true,
    data: filteredCombos,
  })
}

async function ensureComboArtworksExist(artworkIds) {
  const rows = await Promise.all(artworkIds.map((artworkId) => fetchArtworkById(artworkId)))
  if (rows.some((artwork) => !artwork)) {
    const error = new Error('All artworks in a combo must exist.')
    error.status = 400
    error.error = 'INVALID_COMBO_ARTWORKS'
    throw error
  }

  return rows.map(normalizeArtwork)
}

async function ensureComboSetUnique(artworkIds, currentComboId = '') {
  let combos = []

  try {
    combos = await fetchCombos()
  } catch (error) {
    if (!isMissingComboTableError(error)) {
      throw error
    }
  }
  const candidateKey = createArtworkSetKey(artworkIds)
  const duplicateCombo = combos.find(
    (combo) => combo.id !== currentComboId && createArtworkSetKey(combo.artwork_ids || []) === candidateKey,
  )

  if (duplicateCombo) {
    const error = new Error('A combo with the same artwork set already exists.')
    error.status = 409
    error.error = 'DUPLICATE_COMBO'
    throw error
  }
}

async function handleCreateCombo(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const payload = validateWithSchema(comboPayloadSchema, await readJson(req))
  const artworkIds = mergeUniqueArtworks(
    payload.artwork_ids.map((artworkId) => ({ id: Number(artworkId) })),
  ).map((artwork) => Number(artwork.id))

  if (artworkIds.length < 2 || artworkIds.length > 5) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_COMBO_SIZE',
      message: 'A combo must contain between 2 and 5 unique artworks.',
    })
  }

  await ensureComboArtworksExist(artworkIds)
  await ensureComboSetUnique(artworkIds)

  const combo = await createCombo({
    title: payload.title,
    artwork_ids: artworkIds,
    discount_percent: payload.discount_percent,
    is_active: payload.is_active,
  })
  const { artworks } = await readComboContext()

  await logAdminActivity(session, {
    action_type: 'combo_added',
    resource_type: 'combo',
    resource_id: combo?.id,
    details: {
      title: combo?.title || payload.title,
      artwork_ids: artworkIds,
    },
  })

  return sendJson(res, 201, {
    success: true,
    data: normalizeCombo(combo, artworks),
  })
}

async function handleUpdateCombo(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const comboId = getComboId(req)
  if (!comboId) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_COMBO_ID',
      message: 'A valid combo id is required.',
    })
  }

  const existingCombo = await fetchComboById(comboId)
  if (!existingCombo) {
    return sendJson(res, 404, {
      success: false,
      error: 'COMBO_NOT_FOUND',
      message: 'Combo not found.',
    })
  }

  const payload = validateWithSchema(comboPayloadSchema, await readJson(req))
  const artworkIds = mergeUniqueArtworks(
    payload.artwork_ids.map((artworkId) => ({ id: Number(artworkId) })),
  ).map((artwork) => Number(artwork.id))

  if (artworkIds.length < 2 || artworkIds.length > 5) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_COMBO_SIZE',
      message: 'A combo must contain between 2 and 5 unique artworks.',
    })
  }

  await ensureComboArtworksExist(artworkIds)
  await ensureComboSetUnique(artworkIds, comboId)

  const combo = await updateComboById(comboId, {
    title: payload.title,
    artwork_ids: artworkIds,
    discount_percent: payload.discount_percent,
    is_active: payload.is_active,
  })
  const { artworks } = await readComboContext()

  await logAdminActivity(session, {
    action_type: 'combo_edited',
    resource_type: 'combo',
    resource_id: comboId,
    details: {
      title: combo?.title || payload.title,
      artwork_ids: artworkIds,
      is_active: payload.is_active,
    },
  })

  return sendJson(res, 200, {
    success: true,
    data: normalizeCombo(combo, artworks),
  })
}

async function handleDeleteCombo(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const comboId = getComboId(req)
  if (!comboId) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_COMBO_ID',
      message: 'A valid combo id is required.',
    })
  }

  const existingCombo = await fetchComboById(comboId)
  if (!existingCombo) {
    return sendJson(res, 404, {
      success: false,
      error: 'COMBO_NOT_FOUND',
      message: 'Combo not found.',
    })
  }

  await deleteComboById(comboId)
  await logAdminActivity(session, {
    action_type: 'combo_deleted',
    resource_type: 'combo',
    resource_id: comboId,
    details: {
      title: existingCombo.title || null,
      artwork_ids: Array.isArray(existingCombo.artwork_ids) ? existingCombo.artwork_ids : [],
    },
  })

  return sendJson(res, 200, {
    success: true,
    data: { id: comboId },
  })
}

async function handleCreateArtwork(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const body = await readJson(req)
  const payload = validateWithSchema(artworkPayloadSchema, body)
  await registerTags(payload.tags, session.email || 'admin')

  try {
    const artwork = await createArtwork({
      ...withStockStatus(payload),
      image: payload.images[0],
    })

    await logAdminActivity(session, {
      action_type: 'artwork_added',
      resource_type: 'artwork',
      resource_id: artwork?.id,
      details: {
        title: artwork?.title || payload.title,
      },
    })

    return sendJson(res, 201, {
      success: true,
      data: normalizeArtwork(artwork),
    })
  } catch (error) {
    if (
      isMissingCategoryColumn(error) ||
      isMissingFeaturedColumn(error) ||
      isMissingOptionalArtworkColumn(error)
    ) {
      const artwork = await createArtwork({
        ...withoutOptionalArtworkColumns(payload),
        ...withStockStatus(payload),
        image: payload.images[0],
      })

      await logAdminActivity(session, {
        action_type: 'artwork_added',
        resource_type: 'artwork',
        resource_id: artwork?.id,
        details: {
          title: artwork?.title || payload.title,
        },
      })

      return sendJson(res, 201, {
        success: true,
        data: normalizeArtwork(artwork),
      })
    }

    throw error
  }
}

async function handleUpdateArtwork(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const artworkId = getArtworkId(req)
  if (!Number.isInteger(artworkId) || artworkId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_ARTWORK_ID',
      message: 'A valid artwork id is required.',
    })
  }

  const body = await readJson(req)
  const payload = validateWithSchema(artworkPayloadSchema, body)
  await registerTags(payload.tags, session.email || 'admin')
  const existingArtwork = await fetchArtworkById(artworkId)
  const featuredChanged =
    existingArtwork && existingArtwork.is_featured !== payload.is_featured

  try {
    const artwork = await updateArtwork(artworkId, {
      ...withStockStatus(payload),
      image: payload.images[0],
    })

    await logAdminActivity(session, {
      action_type: featuredChanged ? 'artwork_featured' : 'artwork_edited',
      resource_type: 'artwork',
      resource_id: artworkId,
      details: {
        title: artwork?.title || payload.title,
        is_featured: payload.is_featured,
      },
    })

    return sendJson(res, 200, {
      success: true,
      data: normalizeArtwork(artwork),
    })
  } catch (error) {
    if (
      isMissingCategoryColumn(error) ||
      isMissingFeaturedColumn(error) ||
      isMissingOptionalArtworkColumn(error)
    ) {
      const artwork = await updateArtwork(
        artworkId,
        {
          ...withoutOptionalArtworkColumns(payload),
          ...withStockStatus(payload),
          image: payload.images[0],
        },
      )

      await logAdminActivity(session, {
        action_type: featuredChanged ? 'artwork_featured' : 'artwork_edited',
        resource_type: 'artwork',
        resource_id: artworkId,
        details: {
          title: artwork?.title || payload.title,
          is_featured: payload.is_featured,
        },
      })

      return sendJson(res, 200, {
        success: true,
        data: normalizeArtwork(artwork),
      })
    }

    throw error
  }
}

async function handleFetchTags(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const query = String(req.query?.q || '').trim()
  const type = String(req.query?.type || '').trim().toLowerCase()
  const tags = await fetchTagRegistry({
    query,
    type: TAG_TYPES.includes(type) ? type : '',
    onlyActive: true,
    limit: 250,
  })
  return sendJson(res, 200, {
    success: true,
    data: tags,
  })
}

async function handleCreateTag(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const body = await readJson(req)
  const name = normalizeTagName(body.name)
  const type = TAG_TYPES.includes(String(body.type || '').trim()) ? String(body.type).trim() : inferTagType(name)
  if (!name) {
    return sendJson(res, 400, { success: false, error: 'VALIDATION_ERROR', message: 'Tag name is required.' })
  }
  const existing = await fetchTagByName(name)
  if (existing) {
    const updated = await updateTagRegistryEntryById(existing.id, {
      usage_count: Number(existing.usage_count || 0) + 1,
      is_active: true,
    })
    return sendJson(res, 200, { success: true, data: updated || existing, duplicated: true })
  }
  const created = await createTagRegistryEntry({
    name,
    type,
    usage_count: 1,
    created_by: session.email || 'admin',
    is_system: false,
    is_active: true,
  })
  return sendJson(res, 201, { success: true, data: created })
}

async function handleStudioSuggest(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const body = await readJson(req)
  const title = String(body.title || '')
  const description = String(body.description || '')
  const medium = String(body.medium || '')
  const category = String(body.category || 'canvas')
  const imageHints = Array.isArray(body.image_hints) ? body.image_hints : []
  const candidate = { title, description, medium, category, tags: imageHints }
  const suggestedTags = Array.from(new Set(suggestArtworkTags(candidate).concat(imageHints.map(normalizeTagName)))).slice(0, 20)
  const allArtworks = await fetchRecentArtworks(160)
  const similar = allArtworks
    .filter((item) => String(item.id) !== String(body.artwork_id || ''))
    .map((item) => ({
      artwork_id: item.id,
      title: item.title,
      overlap: (Array.isArray(item.tags) ? item.tags : []).filter((tag) => suggestedTags.includes(normalizeTagName(tag))).length,
    }))
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 5)
  const comboSuggestions = similar.filter((item) => item.overlap >= 2).slice(0, 3)
  const previewReasons = buildRecommendationReasons(
    { ...candidate, tags: suggestedTags, price: Number(body.price || 0), id: body.artwork_id || 'draft' },
    mergeTasteProfileForEvent(createEmptyTasteProfile(), {
      event_type: 'artwork_view',
      metadata: { artwork: { ...candidate, tags: suggestedTags } },
    }),
    {},
  )
  const vector = buildTasteVector(
    mergeTasteProfileForEvent(createEmptyTasteProfile(), {
      event_type: 'product_open',
      metadata: { artwork: { ...candidate, tags: suggestedTags, price: Number(body.price || 0) } },
    }),
  )
  const health = buildArtworkHealthScore({ artwork: { ...candidate, tags: suggestedTags }, duplicateMatches: [], comboMatches: comboSuggestions })
  return sendJson(res, 200, {
    success: true,
    data: {
      suggested_tags: suggestedTags,
      suggested_tag_types: suggestedTags.map((tag) => ({ name: tag, type: inferTagType(tag) })),
      room_aesthetic: suggestedTags.filter((tag) => inferTagType(tag) === 'space'),
      similar_artworks: similar,
      combo_suggestions: comboSuggestions,
      live_preview: previewReasons,
      recommendation_confidence: Number(vector.recommendation_confidence || 0),
      metadata_completeness: Math.min(100, 40 + suggestedTags.length * 4 + (description.length > 80 ? 20 : 0)),
      search_discoverability: Math.min(100, 35 + suggestedTags.length * 3 + (title.length > 6 ? 15 : 0)),
      health,
      alt_description: `${title || 'Artwork'} in ${category} style with ${suggestedTags.slice(0, 3).join(', ') || 'curated'} aesthetic.`,
      semantic_keywords: suggestedTags.slice(0, 8),
    },
  })
}

async function handleAiStudioMetrics(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null

  function incrementCounter(counter, key) {
    if (!key) return
    counter.set(key, (counter.get(key) || 0) + 1)
  }

  function topCounterItems(counter, limit = 8) {
    return Array.from(counter.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, limit)
  }

  const [tags, artworks, events, feedbackRows] = await Promise.all([
    fetchTagRegistry({ limit: 500, onlyActive: false }),
    fetchRecentArtworks(240),
    fetchVisitorEvents(900).catch(() => []),
    fetchAdminAiFeedback(500).catch(() => []),
  ])
  const tagStats = new Map()
  const artworkById = new Map(artworks.map((item) => [Number(item.id), item]))
  const ensureTag = (tag) => {
    const key = normalizeTagName(tag)
    if (!key) return null
    if (!tagStats.has(key)) {
      tagStats.set(key, { tag: key, views: 0, clicks: 0, saves: 0, purchases: 0, recommendation_conversions: 0 })
    }
    return tagStats.get(key)
  }
  events.forEach((event) => {
    const artwork = artworkById.get(Number(event.artwork_id))
    const tagsForEvent = Array.isArray(artwork?.tags) ? artwork.tags : []
    tagsForEvent.forEach((tag) => {
      const row = ensureTag(tag)
      if (!row) return
      if (event.event_type === 'artwork_view') row.views += 1
      if (event.event_type === 'artwork_click') row.clicks += 1
      if (event.event_type === 'favorite_added') row.saves += 1
      if (event.event_type === 'recommendation_purchased' || event.event_type === 'order_completed') row.purchases += 1
      if (String(event.event_type || '').startsWith('recommendation_')) row.recommendation_conversions += 1
    })
  })
  const scored = Array.from(tagStats.values()).sort((a, b) => (b.purchases + b.saves + b.clicks) - (a.purchases + a.saves + a.clicks))
  const lowConfidenceArtworks = artworks.filter((artwork) => (Array.isArray(artwork.tags) ? artwork.tags.length : 0) < 3).slice(0, 12)
  const roomEvents = events.filter((event) => String(event.event_type || '').startsWith('room_'))
  const roomPersonalityCounts = new Map()
  const roomStyleCounts = new Map()
  const roomMoodCounts = new Map()
  const roomSetCounts = new Map()

  roomEvents.forEach((event) => {
    const metadata = event.metadata || {}
    if (event.event_type === 'room_personality_detected') {
      incrementCounter(roomPersonalityCounts, String(metadata.room_personality || '').trim())
      ;(Array.isArray(metadata.style) ? metadata.style : []).forEach((style) =>
        incrementCounter(roomStyleCounts, String(style || '').trim()),
      )
      ;(Array.isArray(metadata.moods) ? metadata.moods : []).forEach((mood) =>
        incrementCounter(roomMoodCounts, String(mood || '').trim()),
      )
    }
    if (event.event_type === 'room_set_clicked') {
      incrementCounter(roomSetCounts, String(metadata.combo_id || 'unknown'))
    }
  })

  const roomUploads = roomEvents.filter((event) => event.event_type === 'room_upload').length
  const roomMatches = roomEvents.filter((event) => event.event_type === 'room_match_clicked').length
  const roomPreviews = roomEvents.filter((event) => event.event_type === 'room_preview_opened').length
  const roomSaved = roomEvents.filter((event) => event.event_type === 'room_profile_saved').length

  return sendJson(res, 200, {
    success: true,
    data: {
      top_performing_tags: scored.slice(0, 12),
      low_performing_tags: scored.filter((row) => row.views > 0 && row.clicks === 0).slice(0, 12),
      low_confidence_artworks: lowConfidenceArtworks,
      missing_metadata: artworks.filter((artwork) => !artwork.description || (Array.isArray(artwork.tags) ? artwork.tags.length === 0 : true)).slice(0, 12),
      weak_recommendation_coverage: artworks.filter((artwork) => (Array.isArray(artwork.tags) ? artwork.tags.length : 0) < 2).slice(0, 12),
      search_quality_diagnostics: {
        artworks_without_tags: artworks.filter((artwork) => !Array.isArray(artwork.tags) || artwork.tags.length === 0).length,
        artworks_without_description: artworks.filter((artwork) => String(artwork.description || '').trim().length < 30).length,
      },
      recommendation_diversity_metrics: {
        unique_active_tags: tags.filter((tag) => tag.is_active).length,
        active_artworks: artworks.filter((artwork) => artwork.status !== 'sold').length,
      },
      recommendation_blind_spots: artworks
        .filter((artwork) => (Array.isArray(artwork.tags) ? artwork.tags.length : 0) <= 1)
        .slice(0, 12),
      combo_conversion_quality: scored
        .map((row) => ({
          tag: row.tag,
          conversion_quality: row.clicks > 0 ? Number((row.purchases / row.clicks).toFixed(3)) : 0,
        }))
        .sort((a, b) => b.conversion_quality - a.conversion_quality)
        .slice(0, 12),
      search_coverage_gaps: scored.filter((row) => row.views > 0 && row.clicks === 0).slice(0, 12),
      human_feedback_summary: feedbackRows.slice(0, 20),
      room_personality_distribution: topCounterItems(roomPersonalityCounts, 12),
      room_matched_styles: topCounterItems(roomStyleCounts, 12),
      room_matched_moods: topCounterItems(roomMoodCounts, 12),
      best_performing_room_sets: topCounterItems(roomSetCounts, 12),
      room_recommendation_conversion: {
        uploads: roomUploads,
        matches_clicked: roomMatches,
        previews_opened: roomPreviews,
        profiles_saved: roomSaved,
        match_rate: roomUploads > 0 ? Number((roomMatches / roomUploads).toFixed(3)) : 0,
        preview_rate: roomUploads > 0 ? Number((roomPreviews / roomUploads).toFixed(3)) : 0,
        save_rate: roomUploads > 0 ? Number((roomSaved / roomUploads).toFixed(3)) : 0,
      },
    },
  })
}

function canonicalizeTagName(tag, aliasesByName = new Map()) {
  const normalized = normalizeTagName(tag)
  return aliasesByName.get(normalized) || normalized
}

async function handleTagGovernance(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const [tags, aliases] = await Promise.all([fetchTagRegistry({ limit: 600, onlyActive: false }), fetchTagAliases()])
  return sendJson(res, 200, {
    success: true,
    data: {
      tags,
      aliases,
    },
  })
}

async function handleCreateTagAlias(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const body = await readJson(req)
  const alias = normalizeTagName(body.alias)
  const canonicalTagId = Number(body.canonical_tag_id)
  if (!alias || !Number.isInteger(canonicalTagId) || canonicalTagId <= 0) {
    return sendJson(res, 400, { success: false, error: 'VALIDATION_ERROR', message: 'alias and canonical_tag_id are required.' })
  }
  const created = await createTagAlias({
    alias,
    canonical_tag_id: canonicalTagId,
  })
  return sendJson(res, 201, { success: true, data: created })
}

async function handleTagMerge(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const body = await readJson(req)
  const sourceTag = normalizeTagName(body.source_tag)
  const targetTag = normalizeTagName(body.target_tag)
  if (!sourceTag || !targetTag || sourceTag === targetTag) {
    return sendJson(res, 400, { success: false, error: 'VALIDATION_ERROR', message: 'Valid source_tag and target_tag are required.' })
  }
  const [source, target] = await Promise.all([fetchTagByName(sourceTag), fetchTagByName(targetTag)])
  if (!target) {
    return sendJson(res, 404, { success: false, error: 'TARGET_TAG_NOT_FOUND', message: 'Target tag does not exist.' })
  }
  if (source?.id) {
    await createTagAlias({ alias: sourceTag, canonical_tag_id: target.id }).catch(() => null)
    await updateTagRegistryEntryById(source.id, { is_active: false })
  }
  const artworks = await fetchRecentArtworks(500)
  for (const artwork of artworks) {
    const tags = Array.isArray(artwork.tags) ? artwork.tags : []
    if (!tags.some((tag) => normalizeTagName(tag) === sourceTag)) continue
    const mergedTags = Array.from(
      new Set(
        tags.map((tag) => (normalizeTagName(tag) === sourceTag ? targetTag : normalizeTagName(tag))),
      ),
    )
    await updateArtwork(artwork.id, { tags: mergedTags })
  }
  await updateTagRegistryEntryById(target.id, {
    usage_count: Number(target.usage_count || 0) + 1,
    is_active: true,
  })
  return sendJson(res, 200, {
    success: true,
    data: {
      source_tag: sourceTag,
      target_tag: targetTag,
      propagated: true,
    },
  })
}

async function handleTagRename(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const body = await readJson(req)
  const tagId = Number(body.tag_id)
  const nextName = normalizeTagName(body.new_name)
  if (!Number.isInteger(tagId) || tagId <= 0 || !nextName) {
    return sendJson(res, 400, { success: false, error: 'VALIDATION_ERROR', message: 'tag_id and new_name are required.' })
  }
  const tags = await fetchTagRegistry({ onlyActive: false, limit: 600 })
  const currentTag = tags.find((tag) => Number(tag.id) === tagId)
  if (!currentTag) {
    return sendJson(res, 404, { success: false, error: 'TAG_NOT_FOUND', message: 'Tag not found.' })
  }
  const existingByName = await fetchTagByName(nextName)
  if (existingByName && Number(existingByName.id) !== tagId) {
    return sendJson(res, 409, { success: false, error: 'TAG_NAME_EXISTS', message: 'A tag with this name already exists.' })
  }
  await updateTagRegistryEntryById(tagId, { name: nextName, is_active: true })
  const artworks = await fetchRecentArtworks(500)
  for (const artwork of artworks) {
    const tagsList = Array.isArray(artwork.tags) ? artwork.tags : []
    if (!tagsList.some((tag) => normalizeTagName(tag) === normalizeTagName(currentTag.name))) continue
    const nextTags = Array.from(
      new Set(
        tagsList.map((tag) =>
          normalizeTagName(tag) === normalizeTagName(currentTag.name) ? nextName : normalizeTagName(tag),
        ),
      ),
    )
    await updateArtwork(artwork.id, { tags: nextTags })
  }
  return sendJson(res, 200, { success: true, data: { tag_id: tagId, new_name: nextName } })
}

async function handleTagDeprecate(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const body = await readJson(req)
  const tagId = Number(body.tag_id)
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return sendJson(res, 400, { success: false, error: 'VALIDATION_ERROR', message: 'tag_id is required.' })
  }
  const updated = await updateTagRegistryEntryById(tagId, { is_active: false })
  return sendJson(res, 200, { success: true, data: updated })
}

async function handleRecommendationSandbox(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  const artworkId = Number(req.query?.artwork_id || 0)
  const tags = String(req.query?.tags || '')
    .split(',')
    .map((tag) => normalizeTagName(tag))
    .filter(Boolean)
  const allArtworks = await fetchRecentArtworks(240)
  const [aliasRows, tagRows] = await Promise.all([
    fetchTagAliases().catch(() => []),
    fetchTagRegistry({ limit: 600, onlyActive: false }).catch(() => []),
  ])
  const canonicalById = new Map(tagRows.map((item) => [Number(item.id), normalizeTagName(item.name)]))
  const aliasesByName = new Map(
    aliasRows.map((item) => [normalizeTagName(item.alias), canonicalById.get(Number(item.canonical_tag_id)) || normalizeTagName(item.alias)]),
  )
  const normalizedArtworks = allArtworks.map((artwork) => ({
    ...artwork,
    tags: (Array.isArray(artwork.tags) ? artwork.tags : []).map((tag) => canonicalizeTagName(tag, aliasesByName)),
  }))
  const seedProfile = mergeTasteProfileForEvent(createEmptyTasteProfile(), {
    event_type: 'artwork_view',
    metadata: { artwork: { tags } },
  })
  const ranked = rankArtworksWithPipeline(normalizedArtworks, {
    tasteProfile: seedProfile,
    limit: 50,
  })
  const target = artworkId > 0 ? ranked.find((item) => Number(item.id) === artworkId) : ranked[0]
  const rankIndex = target ? ranked.findIndex((item) => Number(item.id) === Number(target.id)) + 1 : null
  return sendJson(res, 200, {
    success: true,
    data: {
      rank: rankIndex,
      artwork_id: target?.id || null,
      recommendation_confidence: target?.confidence_score || 0,
      why_it_ranks: target?.recommendation_reasons || [],
      target_audience: target?.recommendation_reasons || [],
      combo_compatibility: ranked
        .filter((item) => Number(item.id) !== Number(target?.id || 0))
        .slice(0, 5)
        .map((item) => ({ id: item.id, title: item.title, score: item.ai_score })),
      search_discoverability: Math.round((target?.score_breakdown?.semantic_similarity || 0) * 100),
      diversity_penalty: target?.score_breakdown?.diversity_boost || 0,
      related_artworks: ranked.slice(0, 10).map((item) => ({
        id: item.id,
        title: item.title,
        score: item.ai_score,
        confidence: item.confidence_score,
      })),
    },
  })
}

async function handleAiFeedback(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) return null
  if (req.method === 'GET') {
    const rows = await fetchAdminAiFeedback(500)
    return sendJson(res, 200, { success: true, data: rows })
  }
  const body = await readJson(req)
  const feedbackType = String(body.feedback_type || '').trim()
  const source = String(body.source || '').trim() || 'admin'
  const signalKey = String(body.signal_key || '').trim().toLowerCase()
  const action = String(body.action || '').trim().toLowerCase()
  if (!feedbackType || !signalKey || !['accepted', 'rejected', 'edited'].includes(action)) {
    return sendJson(res, 400, { success: false, error: 'VALIDATION_ERROR', message: 'feedback_type, signal_key and action are required.' })
  }
  const existing = (await fetchAdminAiFeedback(500)).find(
    (row) =>
      row.feedback_type === feedbackType && row.source === source && String(row.signal_key || '') === signalKey,
  )
  const payload = {
    feedback_type: feedbackType,
    source,
    signal_key: signalKey,
    accepted_count: Number(existing?.accepted_count || 0),
    rejected_count: Number(existing?.rejected_count || 0),
    edited_count: Number(existing?.edited_count || 0),
    updated_at: new Date().toISOString(),
  }
  if (action === 'accepted') payload.accepted_count += 1
  if (action === 'rejected') payload.rejected_count += 1
  if (action === 'edited') payload.edited_count += 1
  const upserted = await upsertAdminAiFeedback(payload)
  return sendJson(res, 200, { success: true, data: upserted || payload })
}

async function handleUpdateArtworkStatus(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const artworkId = getArtworkId(req)
  if (!Number.isInteger(artworkId) || artworkId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_ARTWORK_ID',
      message: 'A valid artwork id is required.',
    })
  }

  const body = await readJson(req)
  const payload = validateWithSchema(artworkStatusSchema, body)
  const artwork = await updateArtwork(artworkId, payload)

  await logAdminActivity(session, {
    action_type: 'artwork_status_changed',
    resource_type: 'artwork',
    resource_id: artworkId,
    details: {
      status: payload.status,
      title: artwork?.title || null,
    },
  })

  return sendJson(res, 200, {
    success: true,
    data: normalizeArtwork(artwork),
  })
}

async function handleDeleteArtwork(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const artworkId = getArtworkId(req)
  if (!Number.isInteger(artworkId) || artworkId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_ARTWORK_ID',
      message: 'A valid artwork id is required.',
    })
  }

  const existingArtwork = await fetchArtworkById(artworkId)

  try {
    await deleteArtwork(artworkId)
  } catch (error) {
    if (isReferencedByOrdersError(error)) {
      return sendJson(res, 409, {
        success: false,
        error: 'ARTWORK_HAS_ORDERS',
        message:
          'This artwork can\'t be deleted because it has existing orders — deleting it would break that order history. Mark it as "sold" instead to hide it from the store, or remove the orders first if they were test data.',
      })
    }
    throw error
  }

  await logAdminActivity(session, {
    action_type: 'artwork_deleted',
    resource_type: 'artwork',
    resource_id: artworkId,
    details: {
      title: existingArtwork?.title || null,
    },
  })

  return sendJson(res, 200, {
    success: true,
    data: { id: artworkId },
  })
}

export default async function handler(req, res) {
  try {
    const artworkId = getArtworkId(req)
    const action = getAction(req)

    if (req.method === 'GET' && action === 'combos') {
      return await handleFetchCombos(req, res)
    }
    if (req.method === 'GET' && action === 'tags') {
      return await handleFetchTags(req, res)
    }
    if (req.method === 'POST' && action === 'tags') {
      return await handleCreateTag(req, res)
    }
    if (req.method === 'POST' && action === 'studio-suggest') {
      return await handleStudioSuggest(req, res)
    }
    if (req.method === 'GET' && action === 'recommendation-sandbox') {
      return await handleRecommendationSandbox(req, res)
    }
    if (req.method === 'GET' && action === 'ai-studio') {
      return await handleAiStudioMetrics(req, res)
    }
    if (req.method === 'GET' && action === 'tag-governance') {
      return await handleTagGovernance(req, res)
    }
    if (req.method === 'POST' && action === 'tag-alias') {
      return await handleCreateTagAlias(req, res)
    }
    if (req.method === 'POST' && action === 'tag-merge') {
      return await handleTagMerge(req, res)
    }
    if (req.method === 'POST' && action === 'tag-rename') {
      return await handleTagRename(req, res)
    }
    if (req.method === 'POST' && action === 'tag-deprecate') {
      return await handleTagDeprecate(req, res)
    }
    if ((req.method === 'GET' || req.method === 'POST') && action === 'ai-feedback') {
      return await handleAiFeedback(req, res)
    }

    if (req.method === 'POST' && action === 'combos') {
      return await handleCreateCombo(req, res)
    }

    if ((req.method === 'PUT' || req.method === 'PATCH') && action === 'combos') {
      return await handleUpdateCombo(req, res)
    }

    if (req.method === 'DELETE' && action === 'combos') {
      return await handleDeleteCombo(req, res)
    }

    if (req.method === 'GET' && Number.isInteger(artworkId) && artworkId > 0) {
      return await handleFetchArtwork(req, res)
    }

    if (req.method === 'GET') {
      return await handleFetchArtworks(req, res)
    }

    if (req.method === 'POST') {
      return await handleCreateArtwork(req, res)
    }

    if (req.method === 'PUT' && action === 'status') {
      return await handleUpdateArtworkStatus(req, res)
    }

    if (req.method === 'PUT') {
      return await handleUpdateArtwork(req, res)
    }

    if (req.method === 'DELETE') {
      return await handleDeleteArtwork(req, res)
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  } catch (error) {
    if (error.validationIssues) {
      return sendValidationError(res, error.validationIssues)
    }

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'ARTWORK_REQUEST_FAILED',
      message: error.message || 'Unable to process artwork request.',
    })
  }
}
