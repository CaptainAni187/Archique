import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { createOrder } from '../services/orderService'
import { useOrderContext } from '../state/useOrderContext'
import {
  loadRazorpayScript,
  openRazorpayCheckout,
} from '../services/razorpayService'
import {
  createPaymentOrder,
  verifyPayment,
} from '../services/backendApiService'
import { trackAnalyticsEvent } from '../services/analyticsService'
import { findOrderByPaymentId } from '../services/orderService'
import { fetchShippingRates, validateCoupon } from '../services/couponService'
import Reveal from '../components/Reveal'
import ErrorState from '../components/ErrorState'
import DeliveryAddressFields from '../components/DeliveryAddressFields'
import { fetchUserAddresses } from '../services/userAuthService'
import {
  fetchCurrentUser,
  formatDeliveryAddress,
  getStoredUser,
  saveDeliveryProfile,
} from '../services/userAuthService'
import { getOptimizedImageUrl } from '../utils/imageUrl'
import usePageMeta from '../hooks/usePageMeta'
import { buildPurchaseSelection } from '../utils/comboPricing'
import { getUserFriendlyError } from '../utils/userErrors'

function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
}

const initialForm = {
  name: '',
  phone: '',
  email: '',
  address_line1: '',
  address_line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  acceptedPolicies: false,
  isGift: false,
  giftRecipientName: '',
  giftMessage: '',
}

/** Map a saved address row onto the checkout form's field names. */
function addressToForm(address) {
  if (!address) {
    return {}
  }

  return {
    name: address.recipient_name || '',
    phone: address.phone || '',
    address_line1: address.house || '',
    address_line2: address.street || '',
    landmark: address.landmark || '',
    city: address.city || '',
    state: address.state || '',
    pincode: address.pincode || '',
  }
}

const STEPS = [
  { id: 1, label: 'Delivery details' },
  { id: 2, label: 'Review order' },
  { id: 3, label: 'Payment' },
]

const CONFIRMATION_STORAGE_KEY = 'archique_order_confirmation'
const PENDING_CHECKOUT_STORAGE_KEY = 'archique_pending_checkout'

function buildConfirmation(order) {
  return {
    orderId: order.order_code || `Order #${order.id}`,
    orderCode: order.order_code || null,
    productTitle: order.product_title,
    totalAmount: Number(order.total_amount),
    advanceAmount: order.advance_amount,
    remainingAmount: Number(order.total_amount) - Number(order.advance_amount),
    paymentId: order.razorpay_payment_id || null,
    paymentStatus: order.payment_status || 'advance_paid',
    paymentVerifiedAt: order.payment_verified_at || null,
    customerName: order.customer_name || '',
    customerEmail: order.customer_email || '',
    customerPhone: order.customer_phone || '',
    customerAddress: order.customer_address || '',
  }
}

function Checkout() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    selectedProduct,
    selectedPurchase,
    setOrderDetails,
    setSelectedProduct,
    setSelectedPurchase,
    setOrderConfirmation,
  } = useOrderContext()
  const [form, setForm] = useState(initialForm)
  const [step, setStep] = useState(1)
  const [stepError, setStepError] = useState('')
  const [savedAddresses, setSavedAddresses] = useState([])

  // Saved addresses, so a returning buyer picks rather than retypes. Failure is
  // silent: the form still works, it just has nothing to offer.
  useEffect(() => {
    let cancelled = false

    if (!getStoredUser()) {
      return undefined
    }

    fetchUserAddresses()
      .then((addresses) => {
        if (cancelled || !Array.isArray(addresses) || addresses.length === 0) {
          return
        }
        setSavedAddresses(addresses)
        const preferred = addresses.find((address) => address.is_default) || addresses[0]
        setForm((previous) => ({ ...previous, ...addressToForm(preferred) }))
      })
      .catch(() => null)

    return () => {
      cancelled = true
    }
  }, [])

  // Prefill delivery details from the account. Uses the cached profile first so
  // fields are populated on the very first paint, then refreshes from the
  // server in case the address was changed elsewhere.
  useEffect(() => {
    let cancelled = false

    const apply = (user) => {
      if (!user || cancelled) {
        return
      }
      setForm((previous) => ({
        ...previous,
        // Never clobber something the buyer has already typed.
        name: previous.name || user.name || '',
        email: previous.email || user.email || '',
        phone: previous.phone || user.phone || '',
        address_line1: previous.address_line1 || user.address_line1 || '',
        address_line2: previous.address_line2 || user.address_line2 || '',
        landmark: previous.landmark || user.landmark || '',
        city: previous.city || user.city || '',
        state: previous.state || user.state || '',
        pincode: previous.pincode || user.pincode || '',
      }))
    }

    apply(getStoredUser())
    fetchCurrentUser()
      .then(apply)
      .catch(() => null)

    return () => {
      cancelled = true
    }
  }, [])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isRazorpayReady, setIsRazorpayReady] = useState(false)
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [paymentSetupMessage, setPaymentSetupMessage] = useState('')
  const [paymentSetupRetryKey, setPaymentSetupRetryKey] = useState(0)
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponMessage, setCouponMessage] = useState('')
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)
  const [shippingRates, setShippingRates] = useState(null)
  const [previousOrderCode, setPreviousOrderCode] = useState(null)

  useEffect(() => {
    let isActive = true
    fetchShippingRates()
      .then((rates) => {
        if (isActive && rates) {
          setShippingRates(rates)
        }
      })
      .catch(() => null)
    return () => {
      isActive = false
    }
  }, [])

  usePageMeta({
    title: 'Checkout | Archique',
    description: 'Securely complete payment for your selected artwork from Archique.',
  })

  useEffect(() => {
    if (!selectedProduct && location.state?.product) {
      setSelectedProduct(location.state.product)
    }
    if (!selectedPurchase && location.state?.selection) {
      setSelectedPurchase(location.state.selection)
    }
  }, [
    selectedProduct,
    selectedPurchase,
    location.state,
    setSelectedProduct,
    setSelectedPurchase,
  ])

  const baseSelection =
    selectedPurchase || (selectedProduct ? buildPurchaseSelection([selectedProduct]) : null)

  const checkoutSelection = baseSelection
    ? buildPurchaseSelection(baseSelection.items, {
        comboId: baseSelection.comboId,
        comboTitle: baseSelection.comboTitle,
        curatedDiscountPercent: baseSelection.curatedDiscountPercent,
        type: baseSelection.type,
        coupon: appliedCoupon,
        shippingRates: shippingRates || undefined,
      })
    : null

  const onApplyCoupon = async () => {
    const trimmedCode = couponInput.trim()
    if (!trimmedCode || !baseSelection) {
      return
    }

    setIsApplyingCoupon(true)
    setCouponMessage('')

    try {
      const result = await validateCoupon({
        code: trimmedCode,
        email: form.email.trim(),
        subtotal: baseSelection.pricing.subtotal - baseSelection.pricing.discountAmount,
      })

      if (!result?.valid) {
        setAppliedCoupon(null)
        setCouponMessage(result?.message || 'This coupon code is not valid.')
        return
      }

      setAppliedCoupon(result.coupon)
      setCouponMessage(`Coupon "${result.coupon.code}" applied.`)
    } catch (error) {
      setAppliedCoupon(null)
      setCouponMessage(getUserFriendlyError(error, 'Unable to apply this coupon right now.'))
    } finally {
      setIsApplyingCoupon(false)
    }
  }

  const onRemoveCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponMessage('')
  }

  useEffect(() => {
    if (!checkoutSelection?.primaryItem) {
      return
    }

    void trackAnalyticsEvent('checkout_started', {
      artwork_id: checkoutSelection.primaryItem.id,
      title: checkoutSelection.title,
      price: Number(checkoutSelection.pricing.totalAmount),
    })
  }, [checkoutSelection])

  useEffect(() => {
    let isActive = true
    setPaymentSetupMessage('')
    setIsRazorpayReady(false)

    loadRazorpayScript()
      .then((loaded) => {
        if (isActive) {
          if (!loaded) {
            setPaymentSetupMessage(
              'The payment service is taking longer than expected to load. Please retry setup.',
            )
            return
          }

          setIsRazorpayReady(true)
        }
      })
      .catch((error) => {
        if (isActive) {
          setIsRazorpayReady(false)
          setPaymentSetupMessage(
            getUserFriendlyError(error, 'We could not start the payment service.'),
          )
        }
      })

    return () => {
      isActive = false
    }
  }, [paymentSetupRetryKey])

  useEffect(() => {
    let isActive = true

    async function recoverPendingCheckout() {
      const savedPendingCheckout = sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY)

      if (!savedPendingCheckout) {
        return
      }

      try {
        const pendingCheckout = JSON.parse(savedPendingCheckout)
        const existingOrder = await findOrderByPaymentId(
          pendingCheckout.payment.razorpay_payment_id,
        )

        if (!isActive) {
          return
        }

        // The order from that earlier payment already exists — nothing left
        // to recover. Clear the stale marker so it doesn't keep coming back,
        // and let the customer know where to find it without derailing
        // whatever they came to this page to do now.
        sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY)
        const confirmation = buildConfirmation(existingOrder)
        sessionStorage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(confirmation))
        setPreviousOrderCode(existingOrder.order_code || null)
      } catch (error) {
        if (isActive) {
          setRecoveryMessage(
            getUserFriendlyError(
              error,
              'We found a payment that still needs confirmation. Use Resume Confirmation to continue.',
            ),
          )
        }
      }
    }

    recoverPendingCheckout()

    return () => {
      isActive = false
    }
    // Runs once per page load — session storage is only ever written by this
    // same tab's own checkout attempts.
  }, [])


  if (!checkoutSelection?.primaryItem) {
    return (
      <section className="page-flow">
        <p className="status-message">No artwork selected yet.</p>
        <Link to="/gallery" className="text-link-button">
          Back to Gallery
        </Link>
      </section>
    )
  }

  const subtotal = checkoutSelection.pricing.subtotal
  const shippingCost = checkoutSelection.pricing.shippingCost
  const totalAmount = checkoutSelection.pricing.totalAmount
  const discountAmount = checkoutSelection.pricing.discountAmount
  const discountPercent = checkoutSelection.pricing.discountPercent
  const couponDiscountAmount = checkoutSelection.pricing.couponDiscountAmount


  const finalizeSuccessfulOrder = (createdOrder, successCopy) => {
    const confirmation = buildConfirmation(createdOrder)

    sessionStorage.setItem(
      CONFIRMATION_STORAGE_KEY,
      JSON.stringify(confirmation),
    )
    sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY)

    setOrderDetails(createdOrder)
    setOrderConfirmation(confirmation)
    setSuccessMessage(successCopy)
    setForm(initialForm)
    // Clear the purchased item from context so a browser-back to /checkout
    // doesn't re-prime a "Pay" screen for something already bought.
    setSelectedProduct(null)
    setSelectedPurchase(null)
    void trackAnalyticsEvent('order_completed', {
      order_id: createdOrder.id,
      order_code: createdOrder.order_code || null,
      product_id: createdOrder.product_id || null,
      payment_status: createdOrder.payment_status,
      advance_amount: Number(createdOrder.advance_amount),
      total_amount: Number(createdOrder.total_amount),
    })
    navigate('/checkout/confirmation')
  }

  const recoverPendingCheckout = async () => {
    const savedPendingCheckout = sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY)

    if (!savedPendingCheckout) {
      setRecoveryMessage('')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')
    setRecoveryMessage('')

    try {
      const pendingCheckout = JSON.parse(savedPendingCheckout)

      try {
        const existingOrder = await findOrderByPaymentId(
          pendingCheckout.payment.razorpay_payment_id,
        )
        finalizeSuccessfulOrder(existingOrder, 'Payment already confirmed. Restoring your order.')
        return
      } catch (error) {
        setRecoveryMessage(
          getUserFriendlyError(
            error,
            'We still need to finish confirming your payment. Trying recovery now.',
          ),
        )
      }

      let verificationResult
      try {
        verificationResult = await verifyPayment(pendingCheckout.payment)
      } catch (error) {
        // A concurrent attempt (e.g. another tab) may have already turned
        // this same payment into a real order between our check above and
        // now — look once more before giving up, so the customer lands on
        // their actual order instead of a dead-end error.
        if (String(error?.message || '').toLowerCase().includes('already been used')) {
          const existingOrder = await findOrderByPaymentId(
            pendingCheckout.payment.razorpay_payment_id,
          )
          finalizeSuccessfulOrder(existingOrder, 'Payment already confirmed. Restoring your order.')
          return
        }
        throw error
      }

      if (!verificationResult.verified) {
        throw new Error('Payment could not be verified. Please contact support before retrying.')
      }

      const createdOrder = await createOrder({
        customer_name: pendingCheckout.customer.name,
        customer_phone: pendingCheckout.customer.phone,
        customer_address: pendingCheckout.customer.address,
        customer_email: pendingCheckout.customer.email,
        product_id: pendingCheckout.product.id,
        product_ids: pendingCheckout.product.itemIds,
        combo_id: pendingCheckout.product.comboId || undefined,
        discount_percent: pendingCheckout.product.discountPercent || undefined,
        coupon_code: pendingCheckout.product.couponCode || undefined,
        payment_status: 'advance_paid',
        ...pendingCheckout.payment,
      })

      finalizeSuccessfulOrder(createdOrder, 'Payment confirmed and your order has been restored.')
    } catch (error) {
      setErrorMessage(
        getUserFriendlyError(
          error,
          'We could not recover your payment confirmation yet. Please contact support with your payment ID.',
        ),
      )
      setRecoveryMessage(
        'Your payment may already be captured. Please avoid paying again until confirmation is recovered.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const trimmedName = form.name.trim()
    // The address is collected as structured fields now; orders still store a
    // single line, so compose it the same way the account profile does.
    const trimmedAddress = formatDeliveryAddress(form)
    const trimmedEmail = form.email.trim()
    const normalizedPhone = form.phone.replace(/[\s-]/g, '')
    if (isSubmitting || successMessage) {
      return
    }

    if (!trimmedName || !normalizedPhone || !trimmedAddress || !trimmedEmail) {
      setErrorMessage('All fields are required.')
      return
    }

    if (form.isGift && !form.giftRecipientName.trim()) {
      setErrorMessage("Please tell us who the gift is for, so the parcel is addressed correctly.")
      return
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    const phonePattern = /^\+?[0-9]{10,15}$/

    if (!phonePattern.test(normalizedPhone)) {
      setErrorMessage('Please enter a valid phone number.')
      return
    }

    setIsSubmitting(true)
    setSuccessMessage('')
    setErrorMessage('')
    setRecoveryMessage('')

    try {
      if (!isRazorpayReady) {
        throw new Error('Payment service is not ready. Please refresh and try again.')
      }

      const paymentOrder = await createPaymentOrder(checkoutSelection, {
        couponCode: appliedCoupon?.code,
        customerEmail: trimmedEmail,
      })
      if (!paymentOrder?.id || !paymentOrder?.amount) {
        throw new Error('Unable to initialize payment. Please try again.')
      }

      if (!Number.isInteger(paymentOrder.amount)) {
        throw new Error('Payment amount is invalid. Please contact support.')
      }

      const paymentResult = await new Promise((resolve, reject) => {
        openRazorpayCheckout({
          amountInPaise: paymentOrder.amount,
          orderId: paymentOrder.id,
          customerName: trimmedName,
          customerEmail: trimmedEmail,
          customerPhone: normalizedPhone,
          productTitle: checkoutSelection.title,
          onSuccess: resolve,
          onFailure: (error) => reject(new Error(error?.description || 'Payment failed.')),
          onCancel: () => reject(new Error('Payment cancelled by user.')),
        })
      })

      sessionStorage.setItem(
        PENDING_CHECKOUT_STORAGE_KEY,
        JSON.stringify({
          payment: paymentResult,
          customer: {
            name: trimmedName,
            phone: normalizedPhone,
            address: trimmedAddress,
            email: trimmedEmail,
          },
          product: {
            id: checkoutSelection.primaryItem.id,
            title: checkoutSelection.title,
            itemIds: checkoutSelection.items.map((artwork) => artwork.id),
            comboId: checkoutSelection.comboId || null,
            discountPercent: checkoutSelection.pricing.discountPercent,
            couponCode: appliedCoupon?.code || null,
          },
        }),
      )

      const verificationResult = await verifyPayment(paymentResult)

      if (!verificationResult.verified) {
        throw new Error('Payment could not be verified. No order was created.')
      }

      const createdOrder = await createOrder({
        customer_name: trimmedName,
        customer_phone: normalizedPhone,
        customer_address: trimmedAddress,
        customer_email: trimmedEmail,
        product_id: checkoutSelection.primaryItem.id,
        product_ids: checkoutSelection.items.map((artwork) => artwork.id),
        combo_id: checkoutSelection.comboId || undefined,
        combo_title: checkoutSelection.comboTitle || undefined,
        discount_percent: checkoutSelection.pricing.discountPercent,
        coupon_code: appliedCoupon?.code || undefined,
        is_gift: form.isGift === true,
        gift_recipient_name: form.isGift ? form.giftRecipientName.trim() || undefined : undefined,
        gift_message: form.isGift ? form.giftMessage.trim() || undefined : undefined,
        payment_status: 'advance_paid',
        ...paymentResult,
      })

      finalizeSuccessfulOrder(createdOrder, 'Payment successful. Order confirmed.')
    } catch (error) {
      console.error('Checkout payment/order failure:', error)
      const hasPendingPayment = Boolean(
        sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY),
      )

      setErrorMessage(
        hasPendingPayment
          ? `Payment received, but confirmation is still pending: ${getUserFriendlyError(error, 'Please resume confirmation to finish your order.')}`
          : getUserFriendlyError(error, 'We could not place your order. Please try again.'),
      )

      if (hasPendingPayment) {
        setRecoveryMessage(
          'Do not retry payment yet. Use Resume Confirmation to recover the order from your completed payment.',
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setStepError('')
  }

  const detailsIssue = () => {
    if (!form.name.trim()) return 'Please enter your full name.'
    if (!/^(\+91)?[6-9]\d{9}$/.test(form.phone.replace(/[\s-]/g, '')))
      return 'Enter a valid 10-digit Indian mobile number.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return 'Please enter a valid email address.'
    if (!form.address_line1.trim()) return 'House / flat number is required.'
    if (!form.city.trim()) return 'City is required.'
    if (!form.state.trim()) return 'Please select your state.'
    if (!/^[1-9]\d{5}$/.test(form.pincode.trim())) return 'Enter a valid 6-digit pincode.'
    if (!form.acceptedPolicies) return 'Please accept the Terms & Conditions and Privacy Policy to continue.'
    return ''
  }

  const goToReview = async () => {
    const issue = detailsIssue()
    if (issue) {
      setStepError(issue)
      return
    }

    // Remember the details for next time, but never block checkout on it.
    if (getStoredUser()) {
      saveDeliveryProfile({
        name: form.name,
        phone: form.phone,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        landmark: form.landmark,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
      }).catch(() => null)
    }

    setStepError('')
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const goToStep = (target) => {
    setStepError('')
    setStep(target)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const deliveryAddress = formatDeliveryAddress(form)

  return (
    <section className="page-flow page-with-header-gap checkout-page">
      {previousOrderCode ? (
        <div className="status-message checkout-previous-order-banner">
          <span>
            Your earlier order <strong>{previousOrderCode}</strong> was already confirmed.
          </span>
          <Link to={`/order/${encodeURIComponent(previousOrderCode)}`} className="text-link-button">
            View it
          </Link>
          <button
            type="button"
            className="text-link-button"
            onClick={() => setPreviousOrderCode(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <p className="eyebrow">CHECKOUT</p>

      <ol className="checkout-steps" aria-label="Checkout progress">
        {STEPS.map((entry) => (
          <li
            key={entry.id}
            className={`checkout-step ${step === entry.id ? 'is-current' : ''} ${
              step > entry.id ? 'is-done' : ''
            }`.trim()}
          >
            <span className="checkout-step-index">{step > entry.id ? '✓' : entry.id}</span>
            <span className="checkout-step-label">{entry.label}</span>
          </li>
        ))}
      </ol>

      {/* ── Step 1: delivery details ── */}
      {step === 1 ? (
        <Reveal className="checkout-panel">
          <h1 className="section-title">Where should it go?</h1>
          <p className="section-copy">
            {getStoredUser()
              ? 'Prefilled from your account — edit anything that has changed.'
              : 'We use these details for delivery and your order confirmation.'}
          </p>

          {savedAddresses.length > 0 ? (
            <div className="saved-address-picker">
              <span className="saved-address-label">Deliver to a saved address</span>
              <div className="saved-address-options">
                {savedAddresses.map((address) => {
                  const isActive =
                    form.pincode === address.pincode &&
                    form.address_line1 === (address.house || '')
                  return (
                    <button
                      key={address.id}
                      type="button"
                      className={`saved-address-option ${isActive ? 'is-active' : ''}`.trim()}
                      onClick={() => setForm((previous) => ({ ...previous, ...addressToForm(address) }))}
                    >
                      <strong>{address.label || address.recipient_name}</strong>
                      <span>
                        {address.house}, {address.street}
                        <br />
                        {address.city} {address.pincode}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <DeliveryAddressFields values={form} onChange={setField} />

          {/* A gift goes to someone who did not pay, so the recipient's name is
              captured separately and the parcel must carry no prices. */}
          <div className="gift-block">
            <label className="gift-toggle">
              <input
                type="checkbox"
                checked={form.isGift}
                onChange={(event) => setField('isGift', event.target.checked)}
              />
              <span>This is a gift</span>
            </label>

            {form.isGift ? (
              <div className="gift-fields">
                <p className="gift-note">
                  No prices or invoice will be included in the parcel. Your receipt still comes to
                  you by email.
                </p>
                <label>
                  Recipient's name
                  <input
                    type="text"
                    value={form.giftRecipientName}
                    maxLength={80}
                    onChange={(event) => setField('giftRecipientName', event.target.value)}
                    placeholder="Who is receiving it?"
                  />
                </label>
                <label>
                  Message on the card <span className="optional">(optional)</span>
                  <textarea
                    rows={3}
                    maxLength={400}
                    value={form.giftMessage}
                    onChange={(event) => setField('giftMessage', event.target.value)}
                    placeholder="A short note to include"
                  />
                </label>
              </div>
            ) : null}
          </div>

          <label className="checkout-consent">
            <input
              type="checkbox"
              checked={form.acceptedPolicies}
              onChange={(event) => setField('acceptedPolicies', event.target.checked)}
            />
            <span>
              I agree to the{' '}
              <Link to="/policies" target="_blank" className="inline-policy-link">
                Terms &amp; Conditions
              </Link>{' '}
              and the{' '}
              <Link to="/privacy" target="_blank" className="inline-policy-link">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          {stepError ? <p className="status-message error">{stepError}</p> : null}

          <div className="checkout-step-actions">
            <button type="button" className="text-link-button action-button" onClick={goToReview}>
              Continue to review
            </button>
            <Link to="/cart" className="text-link-button">
              Back to cart
            </Link>
          </div>
        </Reveal>
      ) : null}

      {/* ── Step 2: review ── */}
      {step === 2 ? (
        <Reveal className="checkout-panel">
          <h1 className="section-title">Review your order</h1>

          <div className="checkout-review-items">
            {checkoutSelection.items.map((artwork) => {
              const image =
                (Array.isArray(artwork.images) ? artwork.images[0] : artwork.image) || ''
              return (
                <article key={artwork.id} className="checkout-review-item">
                  <div className="checkout-review-media">
                    {image ? (
                      <img
                        src={getOptimizedImageUrl(image, 320)}
                        alt={artwork.title}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </div>
                  <div className="checkout-review-body">
                    <h3>{artwork.title}</h3>
                    <p>{artwork.medium || artwork.category}</p>
                    {artwork.size ? <p>{artwork.size} in</p> : null}
                  </div>
                  <p className="checkout-review-price">{formatPrice(artwork.price)}</p>
                </article>
              )
            })}
          </div>

          <div className="checkout-review-block">
            <div className="checkout-review-block-head">
              <h3>Delivering to</h3>
              <button type="button" className="text-link-button" onClick={() => goToStep(1)}>
                Edit
              </button>
            </div>
            <p className="checkout-address-name">{form.name}</p>
            <p className="checkout-address-line">{deliveryAddress}</p>
            <p className="checkout-address-line">
              {form.phone} · {form.email}
            </p>
          </div>

          <div className="checkout-review-block">
            <h3>Coupon</h3>
            <div className="checkout-coupon">
              {appliedCoupon ? (
                <div className="checkout-coupon-applied">
                  <span>
                    Coupon <strong>{appliedCoupon.code}</strong> applied
                  </span>
                  <button type="button" className="text-link-button" onClick={onRemoveCoupon}>
                    Remove
                  </button>
                </div>
              ) : (
                <div className="checkout-coupon-input-row">
                  <input
                    type="text"
                    placeholder="Coupon code"
                    value={couponInput}
                    onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isApplyingCoupon || !couponInput.trim()}
                    onClick={onApplyCoupon}
                  >
                    {isApplyingCoupon ? 'Checking...' : 'Apply'}
                  </button>
                </div>
              )}
              {couponMessage ? (
                <p className={`status-message ${appliedCoupon ? 'success' : 'error'}`}>
                  {couponMessage}
                </p>
              ) : null}
            </div>
          </div>

          <div className="checkout-price-breakdown">
            <div className="checkout-price-row">
              <span>Artwork subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {discountPercent > 0 ? (
              <div className="checkout-price-row checkout-price-row-discount">
                <span>
                  Bundle discount ({discountPercent}%)
                </span>
                <span>-{formatPrice(discountAmount)}</span>
              </div>
            ) : null}
            {appliedCoupon ? (
              <div className="checkout-price-row checkout-price-row-discount">
                <span>Coupon ({appliedCoupon.code})</span>
                <span>-{formatPrice(couponDiscountAmount)}</span>
              </div>
            ) : null}
            <div className="checkout-price-row">
              <span>
                Delivery
                {checkoutSelection.items.length > 1 ? ' (combined into one parcel)' : ''}
              </span>
              <span>{formatPrice(shippingCost)}</span>
            </div>
            <div className="checkout-price-row checkout-price-row-total">
              <span>Total payable</span>
              <span>{formatPrice(totalAmount)}</span>
            </div>
          </div>

          <div className="checkout-step-actions">
            <button
              type="button"
              className="text-link-button action-button"
              onClick={() => goToStep(3)}
            >
              Continue to payment
            </button>
            <button type="button" className="text-link-button" onClick={() => goToStep(1)}>
              Back
            </button>
          </div>
        </Reveal>
      ) : null}

      {/* ── Step 3: payment ── */}
      {step === 3 ? (
        <Reveal className="checkout-panel checkout-panel-narrow">
          <h1 className="section-title">Payment</h1>
          <p className="section-copy">
            Paying in full secures the original work for you. You will be redirected to Razorpay to
            complete the payment securely — we never see your card or UPI details.
          </p>

          {paymentSetupMessage ? (
            <ErrorState
              message={paymentSetupMessage}
              retryLabel="Retry Payment Setup"
              onRetry={() => setPaymentSetupRetryKey((value) => value + 1)}
            />
          ) : null}

          <div className="checkout-pay-summary">
            <div className="checkout-price-row checkout-price-row-total">
              <span>Total payable</span>
              <span>{formatPrice(totalAmount)}</span>
            </div>
            <p className="checkout-pay-items">
              {checkoutSelection.items.length}{' '}
              {checkoutSelection.items.length === 1 ? 'work' : 'works'} · delivering to{' '}
              {form.city}, {form.pincode}
            </p>
          </div>

          <form className="checkout-form" onSubmit={onSubmit}>
            <button
              type="submit"
              className="text-link-button action-button"
              disabled={isSubmitting || Boolean(successMessage) || !isRazorpayReady}
            >
              {isSubmitting ? 'Processing Payment...' : `Pay ${formatPrice(totalAmount)}`}
            </button>
          </form>

          {!isRazorpayReady ? (
            <p className="status-message">Preparing secure payment…</p>
          ) : null}
          {recoveryMessage ? <p className="status-message">{recoveryMessage}</p> : null}
          {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}
          {successMessage ? <p className="status-message success">{successMessage}</p> : null}
          {recoveryMessage ? (
            <button
              type="button"
              className="text-link-button action-button secondary-action"
              onClick={recoverPendingCheckout}
              disabled={isSubmitting}
            >
              Retry Confirmation
            </button>
          ) : null}
          {successMessage ? (
            <Link to="/checkout/confirmation" className="text-link-button">
              View Confirmation
            </Link>
          ) : null}

          <div className="checkout-step-actions">
            <button type="button" className="text-link-button" onClick={() => goToStep(2)}>
              Back to review
            </button>
          </div>
        </Reveal>
      ) : null}
    </section>
  )
}

export default Checkout
