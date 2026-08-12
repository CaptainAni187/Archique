import { useState } from 'react'
import { getAdminToken } from '../services/adminAuthService'

function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
}

/**
 * Downloads the orders CSV. Uses fetch + a blob rather than a plain link
 * because the endpoint needs the admin bearer token, which a link cannot send.
 */
async function downloadOrdersCsv(status = 'all') {
  const response = await fetch(`/api/admin?action=orders-export&status=${encodeURIComponent(status)}`, {
    headers: { Authorization: `Bearer ${getAdminToken() || ''}` },
  })

  if (!response.ok) {
    throw new Error('Could not export orders.')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `archique-orders-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}


/**
 * Courier and consignment number, saved with the shipped transition.
 *
 * Kept as its own component so its draft state is local: typing a tracking
 * number should not re-render the whole orders tab.
 */
function ShipmentForm({ order, onUpdateOrderStatus }) {
  const [courier, setCourier] = useState(order.courier_name || '')
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || '')
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url || '')

  const alreadyShipped = ['shipped', 'delivered'].includes(order.payment_status)

  return (
    <div className="shipment-form">
      <h4>Dispatch details</h4>
      <p className="shipment-note">
        Saved with the order and included in the buyer&rsquo;s shipping email. Fill these in before
        marking it shipped.
      </p>
      <div className="shipment-fields">
        <label>
          Courier
          <input
            value={courier}
            placeholder="Delhivery, BlueDart…"
            onChange={(event) => setCourier(event.target.value)}
          />
        </label>
        <label>
          Consignment / AWB
          <input
            value={trackingNumber}
            placeholder="Tracking number"
            onChange={(event) => setTrackingNumber(event.target.value)}
          />
        </label>
        <label>
          Tracking link <span className="optional">(optional)</span>
          <input
            value={trackingUrl}
            placeholder="https://…"
            onChange={(event) => setTrackingUrl(event.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="text-link-button action-button"
        onClick={() =>
          onUpdateOrderStatus(order.id, alreadyShipped ? order.payment_status : 'shipped', {
            courier_name: courier,
            tracking_number: trackingNumber,
            tracking_url: trackingUrl,
          })
        }
      >
        {alreadyShipped ? 'Update dispatch details' : 'Save and mark shipped'}
      </button>
    </div>
  )
}

function AdminOrdersTab({
  orders,
  selectedOrder,
  selectedArtwork,
  orderStatuses,
  onSelectOrder,
  onUpdateOrderStatus,
}) {
  return (
    <section className="admin-tab-panel">
      <div className="admin-export-row">
        <div>
          <h3>Export orders</h3>
          <p>
            Every order with the full delivery address, as a spreadsheet — open it in Excel or
            Google Sheets to work through fulfilment.
          </p>
        </div>
        <button
          type="button"
          className="text-link-button action-button"
          onClick={() => downloadOrdersCsv('all').catch(() => window.alert('Could not export orders.'))}
        >
          Download CSV
        </button>
      </div>

      {selectedOrder ? (
        <section className="order-detail-card">
          <div className="order-detail-header">
            <div>
              <p className="order-detail-kicker">Selected order</p>
              <h3>{selectedOrder.order_code || `Order #${selectedOrder.id}`}</h3>
            </div>
            <span className={`badge status-${selectedOrder.payment_status}`}>
              {selectedOrder.payment_status}
            </span>
          </div>
          {selectedOrder.is_gift ? (
            <div className="order-gift-banner">
              <strong>Gift order</strong>
              <span>
                Ship to {selectedOrder.gift_recipient_name || selectedOrder.customer_name}. Do not
                include any price or invoice in the parcel.
              </span>
              {selectedOrder.gift_message ? (
                <blockquote>“{selectedOrder.gift_message}”</blockquote>
              ) : null}
            </div>
          ) : null}

          {/* Dispatch details. Entered before marking the order shipped, so the
              buyer's email carries something they can actually track. */}
          {/* Keyed on the order so selecting a different one remounts with fresh
              values, rather than syncing state inside an effect. */}
          {['advance_paid', 'processing', 'shipped'].includes(selectedOrder.payment_status) ? (
            <ShipmentForm
              key={selectedOrder.id}
              order={selectedOrder}
              onUpdateOrderStatus={onUpdateOrderStatus}
            />
          ) : null}

          {selectedOrder.invoice ? (
            <div className="order-invoice-block">
              <h4>Invoice {selectedOrder.invoice.invoice_number}</h4>
              <p className="order-invoice-note">
                Frozen at the moment of payment — this is exactly what was charged, regardless of
                any later price change.
              </p>
              <table className="order-invoice-table">
                <tbody>
                  {(selectedOrder.invoice.line_items || []).map((item) => (
                    <tr key={item.artwork_id}>
                      <td>
                        {item.title}
                        {item.size ? <span className="muted"> · {item.size}</span> : null}
                      </td>
                      <td className="numeric">{formatPrice(item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {Number(selectedOrder.invoice.totals?.pairing_discount_amount) > 0 ? (
                    <tr>
                      <td>
                        Multi-piece discount ({selectedOrder.invoice.totals.pairing_discount_percent}%)
                      </td>
                      <td className="numeric">
                        − {formatPrice(selectedOrder.invoice.totals.pairing_discount_amount)}
                      </td>
                    </tr>
                  ) : null}
                  {Number(selectedOrder.invoice.totals?.coupon_discount_amount) > 0 ? (
                    <tr>
                      <td>Coupon {selectedOrder.invoice.totals.coupon_code || ''}</td>
                      <td className="numeric">
                        − {formatPrice(selectedOrder.invoice.totals.coupon_discount_amount)}
                      </td>
                    </tr>
                  ) : null}
                  {Number(selectedOrder.invoice.totals?.shipping) > 0 ? (
                    <tr>
                      <td>Delivery</td>
                      <td className="numeric">
                        {formatPrice(selectedOrder.invoice.totals.shipping)}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="order-invoice-total">
                    <td>Amount paid</td>
                    <td className="numeric">
                      {formatPrice(selectedOrder.invoice.totals?.amount_paid)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}

          <div className="order-detail-grid">
            <div>
              <h4>Customer</h4>
              <p>{selectedOrder.customer_name}</p>
              <p>{selectedOrder.customer_email}</p>
              <p>{selectedOrder.customer_phone}</p>
              <p>{selectedOrder.customer_address}</p>
            </div>
            <div>
              <h4>Product</h4>
              <p>{selectedOrder.product_title}</p>
              <p>Total Paid: {formatPrice(selectedOrder.total_amount)}</p>
              {selectedOrder.coupon_code ? (
                <p>
                  Coupon: {selectedOrder.coupon_code} (-
                  {formatPrice(selectedOrder.coupon_discount_amount)})
                </p>
              ) : null}
              {selectedArtwork ? (
                <>
                  <p>Medium: {selectedArtwork.medium}</p>
                  <p>Size: {selectedArtwork.size}</p>
                  <p>Status: {selectedArtwork.status}</p>
                </>
              ) : (
                <p>Artwork details are unavailable in the current catalog snapshot.</p>
              )}
            </div>
            <div>
              <h4>Payment</h4>
              <p>Payment ID: {selectedOrder.razorpay_payment_id || 'Not recorded'}</p>
              <p>Razorpay Order ID: {selectedOrder.razorpay_order_id || 'Not recorded'}</p>
              <p>
                Verified:{' '}
                {selectedOrder.payment_verified_at
                  ? new Date(selectedOrder.payment_verified_at).toLocaleString()
                  : 'Pending'}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="admin-list">
        {orders.length === 0 ? (
          <p>No orders yet.</p>
        ) : (
          orders.map((order) => (
            <article
              key={order.id}
              className={`admin-item order-item ${order.id === selectedOrder?.id ? 'selected-order' : ''}`.trim()}
              onClick={() => onSelectOrder(order.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectOrder(order.id)
                }
              }}
            >
              <div>
                <h3>{order.order_code || `Order #${order.id}`}</h3>
                <p>Artwork: {order.product_title}</p>
                <p>Customer: {order.customer_name}</p>
                <p>Phone: {order.customer_phone}</p>
                <p>Email: {order.customer_email}</p>
                <p>
                  Total Paid: {formatPrice(order.total_amount)}
                  {order.coupon_code ? ` | Coupon: ${order.coupon_code}` : ''}
                </p>
                <p>
                  Payment: <span className={`badge status-${order.payment_status}`}>{order.payment_status}</span>
                </p>
              </div>
              <div className="btn-col">
                <button type="button" className="btn-secondary" onClick={() => onSelectOrder(order.id)}>
                  View Details
                </button>
                <select
                  value={order.payment_status}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => onUpdateOrderStatus(order.id, event.target.value)}
                >
                  {orderStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

export default AdminOrdersTab
