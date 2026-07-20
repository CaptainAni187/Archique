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
import usePageMeta from '../hooks/usePageMeta'
import { buildPurchaseSelection } from '../utils/comboPricing'
import { getUserFriendlyError } from '../utils/userErrors'

function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
}

const initialForm = {
  name: '',
  phone: '',
  address: '',
  email: '',
}

const CONFIRMATION_STORAGE_KEY = 'archiverse_order_confirmation'
const PENDING_CHECKOUT_STORAGE_KEY = 'archiverse_pending_checkout'

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
    title: 'Checkout | Archiverse',
    description: 'Securely complete payment for your selected artwork from Archiverse.',
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

        const confirmation = buildConfirmation(existingOrder)
        sessionStorage.setItem(
          CONFIRMATION_STORAGE_KEY,
          JSON.stringify(confirmation),
        )
        setOrderDetails(existingOrder)
        setOrderConfirmation(confirmation)
        navigate('/checkout/confirmation', { replace: true })
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
  }, [navigate, setOrderConfirmation, setOrderDetails])

  const checkoutImage = Array.isArray(checkoutSelection?.primaryItem?.images)
    ? checkoutSelection.primaryItem.images[0] || ''
    : checkoutSelection?.primaryItem?.image || ''

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

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

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

      const verificationResult = await verifyPayment(pendingCheckout.payment)

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
    const trimmedAddress = form.address.trim()
    const trimmedEmail = form.email.trim()
    const normalizedPhone = form.phone.replace(/[\s-]/g, '')
    if (isSubmitting || successMessage) {
      return
    }

    if (!trimmedName || !normalizedPhone || !trimmedAddress || !trimmedEmail) {
      setErrorMessage('All fields are required.')
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

  return (
    <section className="page-flow page-with-header-gap">
      <Reveal className="checkout-layout">
        <div className="checkout-product">
          <p className="eyebrow">CHECKOUT</p>
          <h1 className="section-title">COMPLETE YOUR PAYMENT</h1>
          <p className="checkout-note">
            PAYMENT IN FULL SECURES THE ORIGINAL WORK FOR YOU
          </p>
          {checkoutImage ? (
            <img
              src={checkoutImage}
              alt={checkoutSelection.title}
              className="checkout-artwork-image"
              loading="eager"
              decoding="async"
              width="1200"
              height="1500"
            />
          ) : null}
          <div className="checkout-summary">
            <h3>{checkoutSelection.title}</h3>
            {checkoutSelection.items.length > 1 ? (
              <p>Includes: {checkoutSelection.items.map((artwork) => artwork.title).join(', ')}</p>
            ) : null}

            <div className="checkout-price-breakdown">
              <div className="checkout-price-row">
                <span>Artwork subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {discountPercent > 0 ? (
                <div className="checkout-price-row checkout-price-row-discount">
                  <span>Discount ({discountPercent}%)</span>
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
                <span>Shipping</span>
                <span>{formatPrice(shippingCost)}</span>
              </div>
              <div className="checkout-price-row checkout-price-row-total">
                <span>Total payable now</span>
                <span>{formatPrice(totalAmount)}</span>
              </div>
            </div>

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
        </div>

        <form className="checkout-form" onSubmit={onSubmit}>
          <div className="form-intro">
            <p className="eyebrow">Collector Details</p>
            <p className="section-copy">
              We’ll use these details for your payment confirmation and delivery coordination.
            </p>
          </div>
          {paymentSetupMessage ? (
            <ErrorState
              message={paymentSetupMessage}
              retryLabel="Retry Payment Setup"
              onRetry={() => setPaymentSetupRetryKey((value) => value + 1)}
            />
          ) : null}
          <label>
            Name
            <input name="name" value={form.name} onChange={onChange} required />
          </label>
          <label>
            Phone
            <input
              name="phone"
              value={form.phone}
              onChange={onChange}
              placeholder="+91XXXXXXXXXX"
              required
            />
          </label>
          <label>
            Address
            <textarea
              name="address"
              value={form.address}
              onChange={onChange}
              required
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              required
            />
          </label>

          <button
            type="submit"
            className="text-link-button action-button"
            disabled={isSubmitting || Boolean(successMessage)}
          >
            {isSubmitting ? 'Processing Payment...' : `Pay ${formatPrice(totalAmount)}`}
          </button>
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
              Resume Confirmation
            </button>
          ) : null}
          {successMessage ? (
            <Link to="/checkout/confirmation" className="text-link-button">
              View Confirmation
            </Link>
          ) : null}
        </form>
      </Reveal>
    </section>
  )
}

export default Checkout
