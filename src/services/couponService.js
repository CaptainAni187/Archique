import { backendAdminRequest, backendRequest } from './backendApiService'

export async function validateCoupon({ code, email, subtotal }) {
  const payload = await backendRequest('/api/coupons?action=validate', {
    method: 'POST',
    body: JSON.stringify({ code, email, subtotal }),
  })

  return payload.data
}

export async function fetchAdminCoupons() {
  const payload = await backendAdminRequest('/api/coupons')
  return Array.isArray(payload.data) ? payload.data : []
}

export async function createAdminCoupon(coupon) {
  const payload = await backendAdminRequest('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(coupon),
  })

  return payload.data
}

export async function updateAdminCoupon(couponId, coupon) {
  const payload = await backendAdminRequest(
    `/api/coupons?id=${encodeURIComponent(couponId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(coupon),
    },
  )

  return payload.data
}

export async function deleteAdminCoupon(couponId) {
  const payload = await backendAdminRequest(
    `/api/coupons?id=${encodeURIComponent(couponId)}`,
    { method: 'DELETE' },
  )

  return payload.data
}

export async function fetchShippingRates() {
  const payload = await backendRequest('/api/coupons?action=shipping-rates')
  return payload.data
}

export async function updateShippingRates(rates) {
  const payload = await backendAdminRequest('/api/coupons?action=shipping-rates', {
    method: 'PUT',
    body: JSON.stringify(rates),
  })

  return payload.data
}
