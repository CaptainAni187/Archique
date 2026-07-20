import { requireAdminAuth } from './_lib/adminSession.js'
import { logAdminActivity } from './_lib/adminActivity.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { fetchShopSetting, upsertShopSetting } from './_lib/supabaseAdmin.js'
import { sendValidationError, shippingRatesSchema, validateWithSchema } from './_lib/validation.js'

const DEFAULT_SHIPPING_RATES = { canvas: 1200, sketch: 350 }

async function handleGetShippingRates(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  const setting = await fetchShopSetting('shipping_rates').catch(() => null)
  return sendJson(res, 200, {
    success: true,
    data: setting?.value || DEFAULT_SHIPPING_RATES,
  })
}

async function handleUpdateShippingRates(req, res) {
  if (req.method !== 'PUT') {
    return methodNotAllowed(res, ['PUT'])
  }

  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const body = await readJson(req)
  const payload = validateWithSchema(shippingRatesSchema, body)
  const setting = await upsertShopSetting('shipping_rates', payload)

  await logAdminActivity(session, {
    action_type: 'shipping_rates_updated',
    resource_type: 'shop_settings',
    resource_id: 'shipping_rates',
    details: payload,
  })

  return sendJson(res, 200, { success: true, data: setting?.value || payload })
}

export default async function handler(req, res) {
  try {
    const key = String(req.query?.key || '').trim().toLowerCase()

    if (key !== 'shipping_rates') {
      return sendJson(res, 404, {
        success: false,
        error: 'SETTING_NOT_FOUND',
        message: 'Unknown setting key.',
      })
    }

    if (req.method === 'GET') {
      return await handleGetShippingRates(req, res)
    }

    if (req.method === 'PUT') {
      return await handleUpdateShippingRates(req, res)
    }

    return methodNotAllowed(res, ['GET', 'PUT'])
  } catch (error) {
    if (error.validationIssues) {
      return sendValidationError(res, error.validationIssues)
    }

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'SETTINGS_REQUEST_FAILED',
      message: error.message || 'Unable to process settings request.',
    })
  }
}
