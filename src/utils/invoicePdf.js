function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value) {
  if (!value) {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date())
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function sanitize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function escapePdfText(value) {
  return sanitize(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrapText(value, maxCharacters = 62) {
  const text = sanitize(value)

  if (!text) {
    return []
  }

  const words = text.split(' ')
  const lines = []
  let currentLine = ''

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (nextLine.length <= maxCharacters) {
      currentLine = nextLine
      return
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    currentLine = word
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

function drawText(text, x, y, size = 12) {
  return `BT\n/F1 ${size} Tf\n1 0 0 1 ${x} ${y} Tm\n(${escapePdfText(text)}) Tj\nET`
}

function buildInvoiceLines(invoice) {
  const totalAmount = Number(invoice.totalAmount || 0)
  const amountPaid = Number(invoice.advanceAmount || 0)

  const lines = [
    { text: 'ARCHIVERSE', x: 48, y: 792, size: 20 },
    { text: 'Invoice', x: 48, y: 766, size: 16 },
    { text: `Invoice No: ${invoice.orderId || invoice.orderCode || 'Pending'}`, x: 48, y: 734 },
    { text: `Order Code: ${invoice.orderCode || 'Pending'}`, x: 48, y: 716 },
    { text: `Issue Date: ${formatDate(invoice.paymentVerifiedAt)}`, x: 48, y: 698 },
    { text: `Payment ID: ${invoice.paymentId || 'Pending confirmation'}`, x: 48, y: 680 },
    { text: 'Bill To', x: 48, y: 644, size: 14 },
    { text: invoice.customerName || 'Collector', x: 48, y: 622 },
  ]

  let customerY = 604
  const customerDetails = [
    invoice.customerEmail,
    invoice.customerPhone,
    ...(invoice.customerAddress ? wrapText(invoice.customerAddress) : []),
  ].filter(Boolean)

  customerDetails.forEach((detail) => {
    lines.push({ text: detail, x: 48, y: customerY })
    customerY -= 18
  })

  const detailsTop = Math.min(customerY - 18, 568)

  lines.push(
    { text: 'Order Details', x: 48, y: detailsTop, size: 14 },
    { text: `Artwork: ${invoice.productTitle || 'Original artwork'}`, x: 48, y: detailsTop - 24 },
    { text: `Payment Status: Paid in full`, x: 48, y: detailsTop - 42 },
    { text: `Amount Paid: ${formatPrice(amountPaid)}`, x: 48, y: detailsTop - 78 },
    { text: `Total Amount: ${formatPrice(totalAmount)}`, x: 48, y: detailsTop - 96 },
  )

  if (invoice.deliveryEstimate) {
    lines.push({
      text: `Delivery Estimate: ${invoice.deliveryEstimate}`,
      x: 48,
      y: detailsTop - 132,
    })
  }

  lines.push({
    text: 'Thank you for collecting original work from Archiverse.',
    x: 48,
    y: 92,
  })

  return lines
}

function createPdf(contentStream) {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object) => {
    offsets.push(pdf.length)
    pdf += `${object}\n`
  })

  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'

  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}

export function downloadInvoicePdf(invoice) {
  const lines = buildInvoiceLines(invoice)
  const contentStream = [
    '0.2 w',
    '48 752 m',
    '564 752 l',
    'S',
    ...lines.map((line) => drawText(line.text, line.x, line.y, line.size)),
  ].join('\n')

  const blob = createPdf(contentStream)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const filenameBase = sanitize(invoice.orderCode || invoice.orderId || 'archiverse-invoice')

  anchor.href = objectUrl
  anchor.download = `${filenameBase}.pdf`
  anchor.click()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 1000)
}
