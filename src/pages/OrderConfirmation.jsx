import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useOrderContext } from '../state/useOrderContext'
import Reveal from '../components/Reveal'
import usePageMeta from '../hooks/usePageMeta'
import { downloadInvoicePdf } from '../utils/invoicePdf'
import { getUserFriendlyError } from '../utils/userErrors'

function formatPrice(value) {
  return `Rs. ${Number(value).toLocaleString()}`
}

function OrderConfirmation() {
  const { orderConfirmation } = useOrderContext()
  const [errorMessage, setErrorMessage] = useState('')
  const savedConfirmation = sessionStorage.getItem('archiverse_order_confirmation')
  const confirmation =
    orderConfirmation || (savedConfirmation ? JSON.parse(savedConfirmation) : null)

  usePageMeta({
    title: 'Order Confirmation | Archiverse',
    description: 'Review your Archiverse payment confirmation details.',
  })

  if (!confirmation) {
    return <Navigate to="/gallery" replace />
  }

  return (
    <Reveal className="confirmation-card">
      <p className="eyebrow">Confirmation</p>
      <h1 className="section-title">Payment Confirmed</h1>
      <p>Your payment has been received in full. The work is reserved for you.</p>
      <p>
        <strong>Order ID:</strong> {confirmation.orderId}
      </p>
      {confirmation.paymentId ? (
        <p>
          <strong>Payment ID:</strong> {confirmation.paymentId}
        </p>
      ) : null}
      <p>
        <strong>Product:</strong> {confirmation.productTitle}
      </p>
      <p>
        <strong>Amount Paid:</strong> {formatPrice(confirmation.advanceAmount)}
      </p>
      <div className="confirmation-actions">
        <button
          type="button"
          className="text-link-button"
          onClick={() => {
            try {
              downloadInvoicePdf(confirmation)
              setErrorMessage('')
            } catch (error) {
              setErrorMessage(
                getUserFriendlyError(error, 'We could not generate the invoice PDF right now.'),
              )
            }
          }}
        >
          Download Invoice
        </button>
      </div>
      {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}
      {confirmation.orderCode ? (
        <Link to={`/order/${encodeURIComponent(confirmation.orderCode)}`} className="text-link-button">
          Track Order
        </Link>
      ) : null}
      <Link to="/gallery" className="text-link-button">
        Back to Gallery
      </Link>
    </Reveal>
  )
}

export default OrderConfirmation
