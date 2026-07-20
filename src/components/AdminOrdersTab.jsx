function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
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
