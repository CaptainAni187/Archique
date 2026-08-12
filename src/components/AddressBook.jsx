import { useEffect, useState } from 'react'
import { fetchUserAddresses, mutateUserAddress } from '../services/userAuthService'

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

const emptyForm = {
  label: '',
  recipient_name: '',
  phone: '',
  house: '',
  street: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
}

/**
 * Saved delivery addresses.
 *
 * Buyers send work to homes, offices and to other people, and retyping an
 * address at every checkout is where orders get abandoned. The server returns
 * the full list after every change, so this never has to reconcile its own
 * state against what was actually saved.
 */
function AddressBook() {
  const [addresses, setAddresses] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    fetchUserAddresses()
      .then((list) => {
        if (!cancelled) {
          setAddresses(list)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Could not load your saved addresses.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const setField = (name, value) => setForm((previous) => ({ ...previous, [name]: value }))

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setIsOpen(false)
  }

  async function submit(event) {
    event.preventDefault()
    if (isSaving) {
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    setMessage('')

    try {
      const next = await mutateUserAddress({
        ...form,
        op: editingId ? 'update' : 'create',
        id: editingId || undefined,
      })
      setAddresses(next)
      setMessage(editingId ? 'Address updated.' : 'Address saved.')
      resetForm()
    } catch (error) {
      setErrorMessage(error?.message || 'Could not save that address.')
    } finally {
      setIsSaving(false)
    }
  }

  async function run(op, id, confirmText) {
    if (confirmText && !window.confirm(confirmText)) {
      return
    }

    setErrorMessage('')
    setMessage('')

    try {
      setAddresses(await mutateUserAddress({ op, id }))
      setMessage(op === 'delete' ? 'Address removed.' : 'Default address updated.')
    } catch (error) {
      setErrorMessage(error?.message || 'That did not work. Please try again.')
    }
  }

  function startEdit(address) {
    setForm({
      label: address.label || '',
      recipient_name: address.recipient_name || '',
      phone: address.phone || '',
      house: address.house || '',
      street: address.street || '',
      landmark: address.landmark || '',
      city: address.city || '',
      state: address.state || '',
      pincode: address.pincode || '',
    })
    setEditingId(address.id)
    setIsOpen(true)
  }

  return (
    <div className="account-section">
      <div className="account-section-head">
        <h3>Delivery addresses</h3>
        <span className="account-count">{addresses.length}</span>
      </div>

      {addresses.length === 0 ? (
        <p className="account-empty-note">
          Save an address and it will be filled in for you at checkout.
        </p>
      ) : (
        <ul className="address-list">
          {addresses.map((address) => (
            <li key={address.id} className={`address-card ${address.is_default ? 'is-default' : ''}`.trim()}>
              <div className="address-card-body">
                <p className="address-card-title">
                  {address.label || address.recipient_name}
                  {address.is_default ? <span className="address-default-tag">Default</span> : null}
                </p>
                <p className="address-card-lines">
                  {address.recipient_name}
                  <br />
                  {address.house}, {address.street}
                  {address.landmark ? <>, {address.landmark}</> : null}
                  <br />
                  {address.city}, {address.state} {address.pincode}
                  <br />
                  {address.phone}
                </p>
              </div>
              <div className="address-card-actions">
                {!address.is_default ? (
                  <button type="button" className="text-link-button" onClick={() => run('set-default', address.id)}>
                    Make default
                  </button>
                ) : null}
                <button type="button" className="text-link-button" onClick={() => startEdit(address)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-link-button is-danger"
                  onClick={() => run('delete', address.id, 'Remove this address?')}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {message ? <p className="status-message success">{message}</p> : null}
      {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}

      {isOpen ? (
        <form className="address-form" onSubmit={submit}>
          <div className="delivery-row delivery-row-two">
            <label>
              Label <span className="optional">(Home, Office…)</span>
              <input value={form.label} maxLength={40} onChange={(e) => setField('label', e.target.value)} />
            </label>
            <label>
              Recipient name
              <input
                value={form.recipient_name}
                required
                maxLength={80}
                onChange={(e) => setField('recipient_name', e.target.value)}
              />
            </label>
          </div>

          <div className="delivery-row delivery-row-two">
            <label>
              Phone
              <input
                value={form.phone}
                required
                inputMode="tel"
                onChange={(e) => setField('phone', e.target.value)}
              />
            </label>
            <label>
              House / flat number
              <input value={form.house} required onChange={(e) => setField('house', e.target.value)} />
            </label>
          </div>

          <div className="delivery-row delivery-row-two">
            <label>
              Street
              <input value={form.street} required onChange={(e) => setField('street', e.target.value)} />
            </label>
            <label>
              Landmark <span className="optional">(optional)</span>
              <input value={form.landmark} onChange={(e) => setField('landmark', e.target.value)} />
            </label>
          </div>

          <div className="delivery-row delivery-row-three">
            <label>
              City
              <input value={form.city} required onChange={(e) => setField('city', e.target.value)} />
            </label>
            <label>
              State
              <select value={form.state} required onChange={(e) => setField('state', e.target.value)}>
                <option value="">Select</option>
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <label>
              PIN code
              <input
                value={form.pincode}
                required
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setField('pincode', e.target.value.replace(/\D/g, ''))}
              />
            </label>
          </div>

          <div className="address-form-actions">
            <button type="submit" className="text-link-button action-button" disabled={isSaving}>
              {isSaving ? 'Saving…' : editingId ? 'Update address' : 'Save address'}
            </button>
            <button type="button" className="text-link-button" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="text-link-button action-button" onClick={() => setIsOpen(true)}>
          Add an address
        </button>
      )}
    </div>
  )
}

export default AddressBook
