import { requireAdminAuth } from './_lib/adminSession.js'
import { logAdminActivity } from './_lib/adminActivity.js'
import { getBackendConfig } from './_lib/env.js'
import { getMultipartFiles, parseMultipartForm } from './_lib/multipart.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { enforcePublicRateLimit } from './_lib/rateLimit.js'
import { notifyCommissionRequest } from './_lib/notifications.js'
import { uploadPublicFile } from './_lib/supabaseStorage.js'
import { parseCommissionBrief } from '../shared/ai/foundation.js'
import {
  createCommission,
  fetchCommissionById,
  fetchCommissions,
  updateCommissionById,
} from './_lib/supabaseAdmin.js'
import {
  commissionPayloadSchema,
  commissionStatusUpdateSchema,
  sendValidationError,
  validateWithSchema,
} from './_lib/validation.js'

const COMMISSION_BUCKET = 'commission-references'

export const config = {
  api: {
    bodyParser: false,
  },
}

function normalizeCommission(commission) {
  return {
    ...commission,
    reference_images: Array.isArray(commission.reference_images)
      ? commission.reference_images
      : [],
    status: commission.status || 'pending',
  }
}

function parseStructuredBriefField(value) {
  const rawValue = Array.isArray(value) ? value[0] : value

  if (!rawValue) {
    return {}
  }

  if (typeof rawValue === 'object') {
    return rawValue
  }

  try {
    return JSON.parse(rawValue)
  } catch {
    return {}
  }
}

function getCommissionId(req) {
  const commissionId = req.query?.id
  return Array.isArray(commissionId) ? Number(commissionId[0]) : Number(commissionId)
}

function getAction(req) {
  return String(req.query?.action || '').trim().toLowerCase()
}

async function handleCreateCommission(req, res) {
  const contentType = String(req.headers['content-type'] || '')
  let body = {}

  if (contentType.includes('multipart/form-data')) {
    const { fields, files } = await parseMultipartForm(req, {
      maxFiles: 5,
      maxFileSize: 10 * 1024 * 1024,
    })

    const referenceFiles = getMultipartFiles(files, 'reference_images')
    const invalidFile = referenceFiles.find(
      (file) => typeof file.mimetype !== 'string' || !file.mimetype.startsWith('image/'),
    )

    if (invalidFile) {
      return sendJson(res, 400, {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Only image files are allowed.',
        details: [
          {
            path: 'reference_images',
            message: 'Only image files are allowed.',
            code: 'custom',
          },
        ],
      })
    }

    const uploadedImages = await Promise.all(
      referenceFiles.map((file) =>
        uploadPublicFile(file, COMMISSION_BUCKET, 'references').then((uploaded) => uploaded.url),
      ),
    )

    body = {
      name: Array.isArray(fields.name) ? fields.name[0] : fields.name,
      email: Array.isArray(fields.email) ? fields.email[0] : fields.email,
      phone: Array.isArray(fields.phone) ? fields.phone[0] : fields.phone,
      artwork_type: Array.isArray(fields.artwork_type)
        ? fields.artwork_type[0]
        : fields.artwork_type,
      size: Array.isArray(fields.size) ? fields.size[0] : fields.size,
      deadline: Array.isArray(fields.deadline) ? fields.deadline[0] : fields.deadline,
      description: Array.isArray(fields.description)
        ? fields.description[0]
        : fields.description,
      idea_text: Array.isArray(fields.idea_text) ? fields.idea_text[0] : fields.idea_text,
      structured_brief: parseStructuredBriefField(fields.structured_brief),
      clearer_brief: Array.isArray(fields.clearer_brief)
        ? fields.clearer_brief[0]
        : fields.clearer_brief,
      suggested_reply: Array.isArray(fields.suggested_reply)
        ? fields.suggested_reply[0]
        : fields.suggested_reply,
      reference_images: uploadedImages,
    }
  } else {
    body = await readJson(req)
  }

  const validatedPayload = validateWithSchema(commissionPayloadSchema, body)
  const structuredBrief =
    Object.keys(validatedPayload.structured_brief || {}).length > 0
      ? validatedPayload.structured_brief
      : parseCommissionBrief(validatedPayload.idea_text || validatedPayload.description, validatedPayload)
  const payload = {
    ...validatedPayload,
    idea_text: validatedPayload.idea_text || validatedPayload.description,
    structured_brief: structuredBrief,
    clearer_brief: validatedPayload.clearer_brief || structuredBrief.clearer_brief || '',
    suggested_reply: validatedPayload.suggested_reply || structuredBrief.suggested_reply || '',
    status: 'pending',
  }
  const commission = await createCommission(payload)
  const notifications = await notifyCommissionRequest(
    normalizeCommission(commission),
    getBackendConfig(),
  )

  return sendJson(res, 201, {
    success: true,
    data: {
      commission: normalizeCommission(commission),
      notifications,
    },
  })
}

async function handleFetchCommissions(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const commissions = await fetchCommissions()
  return sendJson(res, 200, {
    success: true,
    data: commissions.map(normalizeCommission),
  })
}

async function handleUpdateCommissionStatus(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const commissionId = getCommissionId(req)
  if (!Number.isInteger(commissionId) || commissionId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_COMMISSION_ID',
      message: 'A valid commission id is required.',
    })
  }

  const body = await readJson(req)
  const payload = validateWithSchema(commissionStatusUpdateSchema, body)
  const existingCommission = await fetchCommissionById(commissionId)

  if (!existingCommission) {
    return sendJson(res, 404, {
      success: false,
      error: 'COMMISSION_NOT_FOUND',
      message: 'Commission not found.',
    })
  }

  const updatedCommission = await updateCommissionById(commissionId, payload)

  await logAdminActivity(session, {
    action_type: 'commission_reviewed',
    resource_type: 'commission',
    resource_id: commissionId,
    details: {
      previous_status: existingCommission.status || null,
      next_status: payload.status,
    },
  })

  return sendJson(res, 200, {
    success: true,
    data: normalizeCommission(updatedCommission),
  })
}

export default async function handler(req, res) {
  try {
    const action = getAction(req)

    if (req.method === 'POST') {
      const limited = await enforcePublicRateLimit(req, res, {
        scope: 'commission-create',
        limit: 5,
        windowMs: 10 * 60 * 1000,
        message: 'Too many commission requests. Please wait a few minutes.',
      })
      if (limited) {
        return null
      }
      return await handleCreateCommission(req, res)
    }

    if (req.method === 'GET') {
      return await handleFetchCommissions(req, res)
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && action === 'status') {
      return await handleUpdateCommissionStatus(req, res)
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'PUT'])
  } catch (error) {
    if (error.validationIssues) {
      return sendValidationError(res, error.validationIssues)
    }

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'COMMISSION_REQUEST_FAILED',
      message: error.message || 'Unable to process commission request.',
    })
  }
}
