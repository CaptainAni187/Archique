import { z } from 'zod'
import { sendJson } from './http.js'
import { ORDER_STATUSES } from './orderLifecycle.js'

const artworkCategorySchema = z.enum(['canvas', 'sketch'])
const artworkStatusSchema = z.enum(['available', 'sold'])
const orderStatusSchema = z.enum(ORDER_STATUSES)
const commissionStatusSchema = z.enum(['pending', 'accepted', 'rejected'])
const commissionArtworkTypeSchema = z.enum(['canvas', 'sketch'])

function trimString(value) {
  return typeof value === 'string' ? value.trim() : value
}

const nonEmptyString = z.preprocess(
  trimString,
  z.string().min(1, 'This field is required.'),
)

const optionalTrimmedString = z.preprocess(trimString, z.string().optional()).transform(
  (value) => value || '',
)

const artworkImagesSchema = z
  .array(z.string().trim().url('Each image must have a valid URL.'))
  .min(1, 'Images must contain between 1 and 5 items.')
  .max(5, 'Images must contain between 1 and 5 items.')

const artworkTagsSchema = z
  .array(z.preprocess(trimString, z.string().min(1).max(64)))
  .max(20, 'Tags must contain at most 20 items.')
  .default([])

export const artworkPayloadSchema = z.object({
  title: nonEmptyString,
  price: z.coerce.number().finite().positive('Price must be greater than 0.'),
  description: nonEmptyString,
  medium: optionalTrimmedString,
  size: optionalTrimmedString,
  status: artworkStatusSchema.default('available'),
  is_featured: z.boolean().default(false),
  quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative.').default(1),
  category: z
    .preprocess((value) => String(value || '').trim().toLowerCase(), artworkCategorySchema)
    .default('canvas'),
  tags: artworkTagsSchema,
  instagram_url: z
    .preprocess((value) => {
      const trimmed = trimString(value)
      return trimmed === '' ? undefined : trimmed
    }, z.string().url().optional())
    .transform((value) => value || ''),
  featured_rank: z.coerce.number().int().min(0).optional().nullable(),
  images: artworkImagesSchema,
})

export const comboPayloadSchema = z.object({
  title: nonEmptyString,
  artwork_ids: z
    .array(z.coerce.number().int().positive('A valid artwork id is required.'))
    .min(2, 'A combo must contain between 2 and 5 artworks.')
    .max(5, 'A combo must contain between 2 and 5 artworks.'),
  discount_percent: z.coerce.number().int().min(1).max(50).default(10),
  is_active: z.boolean().default(true),
})

export const orderCreationSchema = z.object({
  product_id: z.coerce.number().int().positive('A valid product_id is required.'),
  product_ids: z
    .array(z.coerce.number().int().positive('A valid product id is required.'))
    .min(1)
    .max(5)
    .optional(),
  combo_id: z.preprocess(trimString, z.string().uuid().optional()),
  combo_title: optionalTrimmedString,
  discount_percent: z.coerce.number().int().min(0).max(50).optional(),
  coupon_code: optionalTrimmedString,
  customer_name: nonEmptyString,
  customer_phone: nonEmptyString,
  customer_address: nonEmptyString,
  customer_email: z.preprocess(trimString, z.string().email('Customer email is invalid.')),
  razorpay_payment_id: nonEmptyString,
  razorpay_order_id: nonEmptyString,
  razorpay_signature: nonEmptyString,
  total_amount: z.coerce.number().positive().optional(),
  advance_amount: z.coerce.number().positive().optional(),
})

export const couponPayloadSchema = z.object({
  code: z.preprocess(trimString, z.string().min(2).max(32)).transform((value) => value.toUpperCase()),
  label: optionalTrimmedString,
  discount_type: z.enum(['percent', 'flat']),
  discount_value: z.coerce.number().positive(),
  expires_at: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().datetime().nullable().optional(),
  ),
  usage_limit: z.preprocess(
    (value) => (value === '' || value == null ? null : value),
    z.coerce.number().int().positive().nullable().optional(),
  ),
  per_customer_limit: z.preprocess(
    (value) => (value === '' || value == null ? null : value),
    z.coerce.number().int().positive().nullable().optional(),
  ),
  min_order_value: z.coerce.number().min(0).default(0),
  is_active: z.boolean().default(true),
}).refine((data) => data.discount_type !== 'percent' || data.discount_value <= 100, {
  message: 'Percentage discounts cannot exceed 100.',
  path: ['discount_value'],
})

export const couponValidateSchema = z.object({
  code: nonEmptyString,
  email: z.preprocess(trimString, z.string().email().optional().or(z.literal(''))),
  subtotal: z.coerce.number().min(0),
})

export const shippingRatesSchema = z.object({
  canvas: z.coerce.number().min(0),
  sketch: z.coerce.number().min(0),
})

export const paymentVerificationSchema = z.object({
  razorpay_payment_id: nonEmptyString,
  razorpay_order_id: nonEmptyString,
  razorpay_signature: nonEmptyString,
})

export const orderUpdateSchema = z.object({
  payment_status: orderStatusSchema,
})

export const commissionStatusUpdateSchema = z.object({
  status: commissionStatusSchema,
})

export const commissionPayloadSchema = z.object({
  name: nonEmptyString,
  email: z.preprocess(trimString, z.string().email('Customer email is invalid.')),
  phone: nonEmptyString,
  artwork_type: commissionArtworkTypeSchema,
  size: nonEmptyString,
  deadline: nonEmptyString,
  description: nonEmptyString,
  idea_text: optionalTrimmedString,
  structured_brief: z.record(z.string(), z.unknown()).optional().default({}),
  clearer_brief: optionalTrimmedString,
  suggested_reply: optionalTrimmedString,
  reference_images: z
    .array(z.string().trim().url('Each reference image must have a valid URL.'))
    .max(5, 'Reference images must contain at most 5 items.')
    .default([]),
  status: commissionStatusSchema.default('pending'),
})

export const testimonialPayloadSchema = z.object({
  customer_name: nonEmptyString,
  review_text: nonEmptyString,
  rating: z.coerce.number().int().min(1).max(5).default(5),
  location: optionalTrimmedString,
  is_visible: z.boolean().default(true),
})

function formatIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join('.') || null,
    message: issue.message,
    code: issue.code,
  }))
}

export function sendValidationError(res, issues) {
  return sendJson(res, 400, {
    success: false,
    error: 'VALIDATION_ERROR',
    details: formatIssues(issues),
  })
}

export function validateWithSchema(schema, payload) {
  const result = schema.safeParse(payload)

  if (!result.success) {
    const error = new Error('Validation failed.')
    error.status = 400
    error.validationIssues = result.error.issues
    throw error
  }

  return result.data
}
