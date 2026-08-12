import {
  backendAdminRequest,
  createVerifiedOrder,
  lookupOrderByCode,
  lookupOrderByPaymentId,
} from './backendApiService'
import { ORDER_STATUSES } from '../constants/orderStatus'

function normalizeOrder(order) {
  return {
    ...order,
    order_code: order.order_code || null,
    total_amount: Number(order.total_amount),
    advance_amount: Number(order.advance_amount),
    processing_at: order.processing_at || null,
    shipped_at: order.shipped_at || null,
    delivered_at: order.delivered_at || null,
    payment_verified_at: order.payment_verified_at || null,
    razorpay_payment_id: order.razorpay_payment_id || null,
    razorpay_order_id: order.razorpay_order_id || null,
    payment_status: ORDER_STATUSES.includes(order.payment_status)
      ? order.payment_status
      : 'pending',
  }
}

export async function createOrder(orderInput) {
  if (!orderInput.customer_name?.trim()) {
    throw new Error('Customer name is required.')
  }

  if (!orderInput.customer_phone?.trim()) {
    throw new Error('Customer phone is required.')
  }

  if (!orderInput.customer_address?.trim()) {
    throw new Error('Customer address is required.')
  }

  if (!orderInput.customer_email?.trim()) {
    throw new Error('Customer email is required.')
  }

  const payload = {
    ...orderInput,
    payment_status: ORDER_STATUSES.includes(orderInput.payment_status)
      ? orderInput.payment_status
      : 'pending',
  }

  const data = await createVerifiedOrder(payload)
  return normalizeOrder(data)
}

export async function fetchOrders() {
  const payload = await backendAdminRequest('/api/orders')
  return (payload.data || []).map(normalizeOrder)
}

export async function findOrderByPaymentId(paymentId) {
  const order = await lookupOrderByPaymentId(paymentId)
  return normalizeOrder(order)
}

export async function findOrderByCode(orderCode) {
  const order = await lookupOrderByCode(orderCode)
  return normalizeOrder(order)
}

export async function updateOrderPaymentStatus(orderId, paymentStatus, shipment = {}) {
  const normalizedStatus = ORDER_STATUSES.includes(paymentStatus)
    ? paymentStatus
    : 'pending'

  const payload = await backendAdminRequest(`/api/orders/${Number(orderId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      payment_status: normalizedStatus,
      ...(shipment.courier_name ? { courier_name: shipment.courier_name } : {}),
      ...(shipment.tracking_number ? { tracking_number: shipment.tracking_number } : {}),
      ...(shipment.tracking_url ? { tracking_url: shipment.tracking_url } : {}),
    }),
  })

  return normalizeOrder(payload.data)
}
