import { useEffect, useState } from 'react'
import {
  createAdminCoupon,
  deleteAdminCoupon,
  fetchAdminCoupons,
  updateAdminCoupon,
} from '../services/couponService'
import { getUserFriendlyError } from '../utils/userErrors'

const initialForm = {
  code: '',
  label: '',
  discount_type: 'percent',
  discount_value: '',
  expires_at: '',
  usage_limit: '',
  per_customer_limit: '',
  min_order_value: '',
  is_active: true,
}

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`
}

function formToPayload(form) {
  return {
    code: form.code.trim(),
    label: form.label.trim(),
    discount_type: form.discount_type,
    discount_value: Number(form.discount_value),
    expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
    per_customer_limit: form.per_customer_limit ? Number(form.per_customer_limit) : null,
    min_order_value: form.min_order_value ? Number(form.min_order_value) : 0,
    is_active: form.is_active,
  }
}

function AdminCouponsTab() {
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadCoupons = async () => {
    setLoading(true)
    try {
      const data = await fetchAdminCoupons()
      setCoupons(data)
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(getUserFriendlyError(error, 'Could not load coupons.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCoupons()
  }, [])

  const onChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }))
  }

  const onEdit = (coupon) => {
    setEditingId(coupon.id)
    setForm({
      code: coupon.code,
      label: coupon.label || '',
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 16) : '',
      usage_limit: coupon.usage_limit != null ? String(coupon.usage_limit) : '',
      per_customer_limit:
        coupon.per_customer_limit != null ? String(coupon.per_customer_limit) : '',
      min_order_value: coupon.min_order_value ? String(coupon.min_order_value) : '',
      is_active: coupon.is_active !== false,
    })
  }

  const onCancelEdit = () => {
    setEditingId(null)
    setForm(initialForm)
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const payload = formToPayload(form)
      if (editingId) {
        await updateAdminCoupon(editingId, payload)
      } else {
        await createAdminCoupon(payload)
      }
      setForm(initialForm)
      setEditingId(null)
      await loadCoupons()
    } catch (error) {
      setErrorMessage(getUserFriendlyError(error, 'Could not save this coupon.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDelete = async (couponId) => {
    try {
      await deleteAdminCoupon(couponId)
      await loadCoupons()
    } catch (error) {
      setErrorMessage(getUserFriendlyError(error, 'Could not delete this coupon.'))
    }
  }

  const onToggleActive = async (coupon) => {
    try {
      await updateAdminCoupon(coupon.id, {
        code: coupon.code,
        label: coupon.label || '',
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        expires_at: coupon.expires_at || null,
        usage_limit: coupon.usage_limit,
        per_customer_limit: coupon.per_customer_limit,
        min_order_value: coupon.min_order_value || 0,
        is_active: !coupon.is_active,
      })
      await loadCoupons()
    } catch (error) {
      setErrorMessage(getUserFriendlyError(error, 'Could not update this coupon.'))
    }
  }

  return (
    <section className="admin-tab-panel">
      <form className="admin-form" onSubmit={onSubmit}>
        <h3>{editingId ? 'Edit Coupon' : 'Create Coupon'}</h3>
        <label>
          Code
          <input name="code" value={form.code} onChange={onChange} placeholder="WELCOME10" required />
        </label>
        <label>
          Label (internal note)
          <input name="label" value={form.label} onChange={onChange} placeholder="Launch week promo" />
        </label>
        <label>
          Discount Type
          <select name="discount_type" value={form.discount_type} onChange={onChange}>
            <option value="percent">Percentage off</option>
            <option value="flat">Flat amount off (Rs.)</option>
          </select>
        </label>
        <label>
          Discount Value
          <input
            name="discount_value"
            type="number"
            min="1"
            max={form.discount_type === 'percent' ? 100 : undefined}
            step="0.01"
            value={form.discount_value}
            onChange={onChange}
            required
          />
        </label>
        <label>
          Expires At (optional)
          <input
            name="expires_at"
            type="datetime-local"
            value={form.expires_at}
            onChange={onChange}
          />
        </label>
        <label>
          Total Usage Limit (optional)
          <input
            name="usage_limit"
            type="number"
            min="1"
            value={form.usage_limit}
            onChange={onChange}
            placeholder="Unlimited"
          />
        </label>
        <label>
          Per-Customer Limit (optional)
          <input
            name="per_customer_limit"
            type="number"
            min="1"
            value={form.per_customer_limit}
            onChange={onChange}
            placeholder="Unlimited"
          />
        </label>
        <label>
          Minimum Order Value (optional)
          <input
            name="min_order_value"
            type="number"
            min="0"
            step="0.01"
            value={form.min_order_value}
            onChange={onChange}
            placeholder="No minimum"
          />
        </label>
        <label>
          <input
            type="checkbox"
            name="is_active"
            checked={form.is_active}
            onChange={onChange}
          />
          Active
        </label>
        <div className="btn-row">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : editingId ? 'Update Coupon' : 'Create Coupon'}
          </button>
          {editingId ? (
            <button type="button" className="btn-secondary" onClick={onCancelEdit}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}

      <div className="admin-list">
        {loading ? (
          <p className="status-message">Loading coupons...</p>
        ) : coupons.length === 0 ? (
          <p className="status-message">No coupons created yet.</p>
        ) : (
          coupons.map((coupon) => (
            <article key={coupon.id} className="admin-item">
              <div>
                <h3>{coupon.code}</h3>
                {coupon.label ? <p>{coupon.label}</p> : null}
                <p>
                  {coupon.discount_type === 'percent'
                    ? `${coupon.discount_value}% off`
                    : `${formatPrice(coupon.discount_value)} off`}
                </p>
                {coupon.min_order_value > 0 ? (
                  <p>Minimum order: {formatPrice(coupon.min_order_value)}</p>
                ) : null}
                {coupon.usage_limit != null ? <p>Usage limit: {coupon.usage_limit}</p> : null}
                {coupon.per_customer_limit != null ? (
                  <p>Per-customer limit: {coupon.per_customer_limit}</p>
                ) : null}
                {coupon.expires_at ? (
                  <p>Expires: {new Date(coupon.expires_at).toLocaleString()}</p>
                ) : null}
                <p>
                  Status:{' '}
                  <span className={`badge ${coupon.is_active ? 'available' : 'sold'}`}>
                    {coupon.is_active ? 'active' : 'inactive'}
                  </span>
                </p>
              </div>
              <div className="btn-col">
                <button type="button" onClick={() => onToggleActive(coupon)}>
                  {coupon.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button type="button" onClick={() => onEdit(coupon)}>
                  Edit
                </button>
                <button type="button" className="btn-danger" onClick={() => onDelete(coupon.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

export default AdminCouponsTab
