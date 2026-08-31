import { STUDIO } from '../constants/contact'

/**
 * The customer's invoice.
 *
 * Previously written by hand as a raw PDF content stream, which has no layout
 * engine — long titles and addresses ran off the page because nothing measured
 * them. This renders the document as HTML and hands it to the browser's print
 * pipeline instead, so text wraps, the table aligns, and the studio's colours
 * survive. The buyer chooses "Save as PDF" in the print dialogue.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function downloadInvoicePdf(invoice) {
  const total = Number(invoice.totalAmount || invoice.total_amount || 0)
  const paid = Number(invoice.advanceAmount || invoice.advance_amount || total)
  const discount = Number(invoice.couponDiscountAmount || invoice.coupon_discount_amount || 0)
  const couponCode = invoice.couponCode || invoice.coupon_code || ''
  const orderCode = invoice.orderCode || invoice.order_id || invoice.order_code || ''

  const rows = [
    [escapeHtml(invoice.productTitle || invoice.product_title || 'Original artwork'), formatPrice(total - (invoice.shipping || 0))],
    discount > 0 ? [`Discount${couponCode ? ` · ${escapeHtml(couponCode)}` : ''}`, `− ${formatPrice(discount)}`] : null,
  ].filter(Boolean)

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(orderCode)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1d1d1f; margin: 0; font-size: 10.5pt; line-height: 1.5; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c6a962; padding-bottom: 12px; }
  .mark { font-size: 20pt; font-weight: 300; letter-spacing: 0.26em; color: #1d1d1f; }
  .tag { font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase; color: #8a7a4e; margin-top: 4px; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 15pt; font-weight: 600; letter-spacing: 0.1em; color: #7d6320; text-transform: uppercase; }
  .doc .num { font-size: 12pt; font-weight: 600; margin-top: 3px; }
  .doc .date { font-size: 9pt; color: #666; }
  .paid { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 10px; background: #e8f3ea; color: #1d6b32; font-size: 8pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .cols { display: flex; gap: 28px; margin: 22px 0 6px; }
  .col { flex: 1; }
  .label { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 5px; }
  .val { font-size: 10pt; line-height: 1.55; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  th { text-align: left; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6b6b; background: #faf7f0; border-top: 1px solid #e4dcc8; border-bottom: 1px solid #e4dcc8; padding: 8px 10px; }
  th.r, td.r { text-align: right; }
  td { padding: 11px 10px; border-bottom: 1px solid #efece4; vertical-align: top; word-break: break-word; }
  .totals { margin-left: auto; width: 58%; margin-top: 10px; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 10pt; }
  .totals .grand { margin-top: 4px; border-top: 2px solid #c6a962; font-weight: 700; font-size: 12pt; color: #1d1d1f; padding-top: 9px; }
  .note { margin-top: 26px; padding: 12px 14px; background: #faf7f0; border-left: 3px solid #c6a962; font-size: 9pt; color: #4a4a4a; }
  .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e4dcc8; font-size: 8.5pt; color: #6b6b6b; display: flex; justify-content: space-between; gap: 16px; }
  .foot a { color: #7d6320; text-decoration: none; }
</style></head><body>
  <div class="top">
    <div>
      <div class="mark">ARCHIQUE</div>
      <div class="tag">Original artwork · one of each</div>
    </div>
    <div class="doc">
      <h1>Invoice</h1>
      <div class="num">${escapeHtml(orderCode)}</div>
      <div class="date">${formatDate(invoice.paymentVerifiedAt || invoice.created_at)}</div>
      <div class="paid">Paid in full</div>
    </div>
  </div>

  <div class="cols">
    <div class="col">
      <div class="label">Billed to</div>
      <div class="val">
        <strong>${escapeHtml(invoice.customerName || invoice.customer_name || '')}</strong><br>
        ${escapeHtml(invoice.customerAddress || invoice.customer_address || '').replaceAll('\n', '<br>')}<br>
        ${escapeHtml(invoice.customerPhone || invoice.customer_phone || '')}<br>
        ${escapeHtml(invoice.customerEmail || invoice.customer_email || '')}
      </div>
    </div>
    <div class="col">
      <div class="label">From</div>
      <div class="val">
        <strong>Archique</strong><br>
        ${escapeHtml(STUDIO.city)}<br>
        ${escapeHtml(STUDIO.phone)}<br>
        ${escapeHtml(STUDIO.email)}
      </div>
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
    <tbody>
      ${rows.map(([a, b]) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div><span>Order total</span><span>${formatPrice(total)}</span></div>
    <div class="grand"><span>Amount paid</span><span>${formatPrice(paid)}</span></div>
  </div>

  ${
    invoice.paymentId || invoice.razorpay_payment_id
      ? `<div class="note">Payment reference: ${escapeHtml(invoice.paymentId || invoice.razorpay_payment_id)} · Paid securely via Razorpay. Archique never stores card or UPI details.</div>`
      : ''
  }

  <div class="foot">
    <span>${escapeHtml(STUDIO.email)} · ${escapeHtml(STUDIO.phone)}</span>
    <span>${escapeHtml(STUDIO.instagramHandle)}</span>
    <span>archique.in</span>
  </div>
</body></html>`

  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)

  const doc = frame.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  frame.contentWindow.focus()
  frame.contentWindow.print()

  window.setTimeout(() => frame.remove(), 1000)
}
