const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || ''
const RAZORPAY_SCRIPT_ID = 'razorpay-checkout-script'

function isRazorpayLoaded() {
  return typeof window !== 'undefined' && Boolean(window.Razorpay)
}

export async function loadRazorpayScript() {
  if (isRazorpayLoaded()) {
    return true
  }

  const existing = document.getElementById(RAZORPAY_SCRIPT_ID)
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(true), { once: true })
      existing.addEventListener('error', () => resolve(false), { once: true })
    })
  }

  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.id = RAZORPAY_SCRIPT_ID
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export function openRazorpayCheckout({
  amountInPaise,
  orderId,
  customerName,
  customerEmail,
  customerPhone,
  productTitle,
  onSuccess,
  onFailure,
  onCancel,
}) {
  if (!RAZORPAY_KEY_ID) {
    throw new Error('Razorpay is not configured. Set VITE_RAZORPAY_KEY_ID.')
  }

  if (!isRazorpayLoaded()) {
    throw new Error('Razorpay SDK failed to load.')
  }

  const options = {
    key: RAZORPAY_KEY_ID,
    amount: amountInPaise,
    currency: 'INR',
    order_id: orderId,
    name: 'Archiverse',
    description: `Full payment for ${productTitle}`,
    handler: (response) => {
      onSuccess({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id || null,
        razorpay_signature: response.razorpay_signature || null,
      })
    },
    prefill: {
      name: customerName,
      email: customerEmail,
      contact: customerPhone,
    },
    theme: {
      color: '#b99758',
    },
    modal: {
      ondismiss: () => onCancel?.(),
    },
  }

  const instance = new window.Razorpay(options)
  instance.on('payment.failed', (event) => {
    onFailure?.(event.error)
  })
  instance.open()
}
