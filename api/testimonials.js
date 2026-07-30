import { z } from 'zod'
import { requireAdminAuth } from './_lib/adminSession.js'
import { logAdminActivity } from './_lib/adminActivity.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { enforcePublicRateLimit } from './_lib/rateLimit.js'
import { supabaseAdminRequest } from './_lib/supabaseAdmin.js'

const testimonialCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  content: z.string().trim().min(1, 'Content is required.'),
  artwork_id: z.coerce.number().int().positive().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  is_featured: z.boolean().optional(),
  is_visible: z.boolean().optional(),
})

const testimonialUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').optional(),
    content: z.string().trim().min(1, 'Content is required.').optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    is_featured: z.boolean().optional(),
    is_visible: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field is required.',
  })

function getFeaturedFilter(req) {
  return String(req.query?.featured || '').trim().toLowerCase() === 'true'
}

function getTestimonialId(req) {
  const value = req.query?.id
  return Array.isArray(value) ? Number(value[0]) : Number(value)
}

function sendValidationError(res, issues) {
  return sendJson(res, 400, {
    success: false,
    error: 'VALIDATION_ERROR',
    message: 'Validation failed.',
    details: issues.map((issue) => ({
      path: issue.path.join('.') || null,
      message: issue.message,
      code: issue.code,
    })),
  })
}

function validate(schema, payload) {
  const result = schema.safeParse(payload)

  if (!result.success) {
    const error = new Error('Validation failed.')
    error.status = 400
    error.validationIssues = result.error.issues
    throw error
  }

  return result.data
}

function normalizeTestimonial(testimonial) {
  return {
    id: testimonial.id,
    name: String(testimonial.name || testimonial.customer_name || '').trim(),
    content: String(testimonial.content || testimonial.review_text || '').trim(),
    artwork_id:
      testimonial.artwork_id == null || testimonial.artwork_id === ''
        ? null
        : Number(testimonial.artwork_id),
    rating:
      testimonial.rating == null || testimonial.rating === ''
        ? null
        : Number(testimonial.rating),
    is_featured: testimonial.is_featured === true,
    is_visible: testimonial.is_visible !== false,
    created_at: testimonial.created_at || null,
  }
}

async function fetchTestimonials(featuredOnly) {
  const filters = ['select=*', 'is_visible=eq.true', 'order=created_at.desc']

  if (featuredOnly) {
    filters.push('is_featured=eq.true')
  }

  const response = await supabaseAdminRequest(`testimonials?${filters.join('&')}`)
  return response.map(normalizeTestimonial)
}

async function createTestimonial(payload) {
  const response = await supabaseAdminRequest('testimonials', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return normalizeTestimonial(response?.[0] || null)
}

async function updateTestimonial(id, payload) {
  const response = await supabaseAdminRequest(`testimonials?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] ? normalizeTestimonial(response[0]) : null
}

async function deleteTestimonial(id) {
  await supabaseAdminRequest(`testimonials?id=eq.${Number(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  })
}

async function handleGet(req, res) {
  const testimonials = await fetchTestimonials(getFeaturedFilter(req))
  return sendJson(res, 200, {
    success: true,
    data: testimonials,
  })
}

async function handlePost(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const body = await readJson(req)
  const payload = validate(testimonialCreateSchema, body)
  const testimonial = await createTestimonial({
    ...payload,
    is_featured: payload.is_featured ?? false,
    is_visible: payload.is_visible ?? true,
  })

  await logAdminActivity(session, {
    action_type: 'testimonial_added',
    resource_type: 'testimonial',
    resource_id: testimonial?.id,
    details: {
      name: testimonial?.name || payload.name,
    },
  })

  return sendJson(res, 201, {
    success: true,
    data: testimonial,
  })
}

async function handlePatch(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const testimonialId = getTestimonialId(req)
  if (!Number.isInteger(testimonialId) || testimonialId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_TESTIMONIAL_ID',
      message: 'A valid testimonial id is required.',
    })
  }

  const body = await readJson(req)
  const payload = validate(testimonialUpdateSchema, body)
  const testimonial = await updateTestimonial(testimonialId, payload)

  if (!testimonial) {
    return sendJson(res, 404, {
      success: false,
      error: 'TESTIMONIAL_NOT_FOUND',
      message: 'Testimonial not found.',
    })
  }

  await logAdminActivity(session, {
    action_type: 'testimonial_updated',
    resource_type: 'testimonial',
    resource_id: testimonialId,
    details: payload,
  })

  return sendJson(res, 200, {
    success: true,
    data: testimonial,
  })
}

async function handleDelete(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const testimonialId = getTestimonialId(req)
  if (!Number.isInteger(testimonialId) || testimonialId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_TESTIMONIAL_ID',
      message: 'A valid testimonial id is required.',
    })
  }

  await deleteTestimonial(testimonialId)
  await logAdminActivity(session, {
    action_type: 'testimonial_deleted',
    resource_type: 'testimonial',
    resource_id: testimonialId,
  })
  return sendJson(res, 200, {
    success: true,
    data: { id: testimonialId },
  })
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return await handleGet(req, res)
    }

    if (req.method === 'POST') {
      const limited = await enforcePublicRateLimit(req, res, {
        scope: 'testimonial-create',
        limit: 5,
        windowMs: 10 * 60 * 1000,
      })
      if (limited) {
        return null
      }
      return await handlePost(req, res)
    }

    if (req.method === 'PATCH') {
      return await handlePatch(req, res)
    }

    if (req.method === 'DELETE') {
      return await handleDelete(req, res)
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE'])
  } catch (error) {
    if (error.validationIssues) {
      return sendValidationError(res, error.validationIssues)
    }

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'TESTIMONIAL_REQUEST_FAILED',
      message: error.message || 'Unable to process testimonials.',
    })
  }
}
