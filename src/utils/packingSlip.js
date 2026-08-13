/**
 * A printable packing slip for the studio.
 *
 * The CSV export is right for working through a batch, but when a single
 * parcel is being packed there was nothing to print — the address had to be
 * copied off a screen, which is exactly how a gift receipt ends up in the
 * wrong box or a pincode gets a digit wrong.
 *
 * Opens the browser's print dialogue against a purpose-built document rather
 * than generating a PDF, so it prints identically wherever it is run and needs
 * no dependency.
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

export function printPackingSlip(order, artworksById = new Map()) {
  const ids = Array.isArray(order?.product_ids) && order.product_ids.length
    ? order.product_ids
    : [order?.product_id].filter(Boolean)

  const lines = ids.map((id) => {
    const artwork = artworksById.get(Number(id))
    return {
      title: artwork?.title || order?.product_title || `Artwork #${id}`,
      size: artwork?.size || '',
      medium: artwork?.category || '',
    }
  })

  const isGift = order?.is_gift === true

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Packing slip ${escapeHtml(order?.order_code || '')}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #111; margin: 0; font-size: 11pt; line-height: 1.45; }
  .mark { font-size: 15pt; font-weight: 300; letter-spacing: 0.28em; }
  .rule { height: 2px; background: #c6a962; margin: 8px 0 14px; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .label { font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; color: #777; margin-bottom: 3px; }
  .block { margin-bottom: 14px; }
  .address { font-size: 12.5pt; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: #777; border-bottom: 1px solid #ccc; padding: 5px 0; }
  td { padding: 7px 0; border-bottom: 1px solid #eee; font-size: 10.5pt; vertical-align: top; }
  .gift { margin: 12px 0; padding: 9px 12px; border: 1.5px solid #111; border-radius: 3px; }
  .gift-title { font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; font-size: 8.5pt; }
  .gift-note { margin-top: 5px; font-style: italic; }
  .warn { margin-top: 4px; font-size: 8.5pt; font-weight: 700; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 8.5pt; color: #666; display: flex; justify-content: space-between; }
  .checkbox { display: inline-block; width: 10px; height: 10px; border: 1px solid #333; margin-right: 6px; vertical-align: -1px; }
</style></head><body>
  <div class="row">
    <div class="mark">ARCHIQUE</div>
    <div style="text-align:right">
      <div class="label">Order</div>
      <strong>${escapeHtml(order?.order_code || '')}</strong>
    </div>
  </div>
  <div class="rule"></div>

  <div class="block">
    <div class="label">Deliver to</div>
    <div class="address">
      <strong>${escapeHtml(order?.customer_name || '')}</strong><br>
      ${escapeHtml(order?.customer_address || '').replaceAll('\n', '<br>')}<br>
      ${escapeHtml(order?.customer_phone || '')}
    </div>
  </div>

  ${
    isGift
      ? `<div class="gift">
    <div class="gift-title">Gift order — do not enclose any price</div>
    ${order?.gift_message ? `<div class="gift-note">&ldquo;${escapeHtml(order.gift_message)}&rdquo;</div>` : ''}
    <div class="warn">Pack the gift note. Leave the invoice out of the parcel.</div>
  </div>`
      : ''
  }

  <div class="block">
    <div class="label">Contents</div>
    <table>
      <thead><tr><th>Work</th><th>Size</th><th>Type</th></tr></thead>
      <tbody>
        ${lines
          .map(
            (line) =>
              `<tr><td>${escapeHtml(line.title)}</td><td>${escapeHtml(line.size)}</td><td>${escapeHtml(line.medium)}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>

  <div class="block">
    <div class="label">Before sealing</div>
    <div style="font-size:10pt">
      <span class="checkbox"></span>Glassine wrap &nbsp;
      <span class="checkbox"></span>Corner protectors &nbsp;
      <span class="checkbox"></span>Rigid box<br>
      <span class="checkbox"></span>${isGift ? 'Gift note enclosed, no invoice' : 'Invoice enclosed'} &nbsp;
      <span class="checkbox"></span>Address label matches above
    </div>
  </div>

  <div class="foot">
    <span>${isGift ? 'Gift' : formatPrice(order?.total_amount)}</span>
    <span>${escapeHtml(order?.courier_name || '')} ${escapeHtml(order?.tracking_number || '')}</span>
    <span>archique.in</span>
  </div>
</body></html>`

  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const doc = frame.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  frame.contentWindow.focus()
  frame.contentWindow.print()

  // Give the print dialogue time to take its snapshot before tearing down.
  window.setTimeout(() => frame.remove(), 1000)
}
