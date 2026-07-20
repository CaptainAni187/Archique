import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Reveal from '../components/Reveal'
import ErrorState from '../components/ErrorState'
import usePageMeta from '../hooks/usePageMeta'
import { findOrderByCode } from '../services/orderService'
import { downloadInvoicePdf } from '../utils/invoicePdf'
import { getUserFriendlyError } from '../utils/userErrors'

// The DB status key stays 'advance_paid' for backward compatibility with
// existing orders; it now means "payment received in full".
const PAYMENT_STATUS_LABELS = {
  pending: 'Pending',
  advance_paid: 'Payment Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function formatStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] || status
}

const timelineSteps = [
  {
    key: 'advance_paid',
    label: 'Payment Confirmed',
    timestampKey: 'payment_verified_at',
  },
  {
    key: 'processing',
    label: 'Processing',
    timestampKey: 'processing_at',
  },
  {
    key: 'shipped',
    label: 'Shipped',
    timestampKey: 'shipped_at',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    timestampKey: 'delivered_at',
  },
]

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`
}

function formatDateTime(value) {
  if (!value) {
    return 'Pending'
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function isStepComplete(order, step) {
  if (step.key === 'advance_paid') {
    return ['advance_paid', 'processing', 'shipped', 'delivered'].includes(order.payment_status)
  }

  return Boolean(order[step.timestampKey])
}

function OrderTracking() {
  const { orderCode = '' } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [invoiceErrorMessage, setInvoiceErrorMessage] = useState('')

  usePageMeta({
    title: 'Order Tracking | Archiverse',
    description: 'Track your Archiverse order status and delivery timeline.',
  })

  useEffect(() => {
    let isCancelled = false

    async function loadOrder() {
      setLoading(true)
      setErrorMessage('')

      try {
        const response = await findOrderByCode(orderCode)
        if (!isCancelled) {
          setOrder(response)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            getUserFriendlyError(error, 'We could not load this order right now.'),
          )
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadOrder()

    return () => {
      isCancelled = true
    }
  }, [orderCode, retryKey])

  if (loading) {
    return <p className="status-message">Loading order tracking...</p>
  }

  if (errorMessage) {
    return (
      <Reveal className="confirmation-card">
        <p className="eyebrow">Order Tracking</p>
        <h1 className="section-title">Order Not Found</h1>
        <ErrorState
          message={errorMessage}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
        <Link to="/store" className="text-link-button">
          Back to Store
        </Link>
      </Reveal>
    )
  }

  if (!order) {
    return null
  }

  return (
    <Reveal className="confirmation-card order-tracking-card">
      <p className="eyebrow">Order Tracking</p>
      <div className="order-detail-header">
        <div>
          <h1 className="section-title">{order.order_code}</h1>
          <p>{order.product_title}</p>
        </div>
        <span className={`badge status-${order.payment_status}`}>
          {formatStatusLabel(order.payment_status)}
        </span>
      </div>

      <div className="order-detail-grid">
        <p>
          <strong>Order Status:</strong> {formatStatusLabel(order.payment_status)}
        </p>
        <p>
          <strong>Amount Paid:</strong> {formatPrice(order.advance_amount)}
        </p>
      </div>

      <div className="tracking-timeline">
        {timelineSteps.map((step) => {
          const complete = isStepComplete(order, step)

          return (
            <div
              key={step.key}
              className={`tracking-step ${complete ? 'is-complete' : ''}`.trim()}
            >
              <span className="tracking-dot" aria-hidden="true" />
              <div>
                <strong>{step.label}</strong>
                <p>{formatDateTime(order[step.timestampKey])}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="confirmation-actions">
        <button
          type="button"
          className="text-link-button"
          onClick={() => {
            try {
              downloadInvoicePdf({
                orderId: order.order_code || `Order #${order.id}`,
                orderCode: order.order_code,
                productTitle: order.product_title,
                totalAmount: order.total_amount,
                advanceAmount: order.advance_amount,
                paymentId: order.razorpay_payment_id,
                paymentStatus: order.payment_status,
                paymentVerifiedAt: order.payment_verified_at,
                customerName: order.customer_name,
                customerEmail: order.customer_email,
                customerPhone: order.customer_phone,
                customerAddress: order.customer_address,
              })
              setInvoiceErrorMessage('')
            } catch (error) {
              setInvoiceErrorMessage(
                getUserFriendlyError(error, 'We could not generate the invoice PDF right now.'),
              )
            }
          }}
        >
          Download Invoice
        </button>
      </div>
      {invoiceErrorMessage ? <p className="status-message error">{invoiceErrorMessage}</p> : null}
    </Reveal>
  )
}

export default OrderTracking
