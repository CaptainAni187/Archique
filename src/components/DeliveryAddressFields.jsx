const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

/**
 * The delivery address, broken into the fields an Indian courier actually
 * needs, rather than one free-text box. Shared by checkout and the account
 * details step so both collect exactly the same shape.
 *
 * `values` uses snake_case keys matching the API and the user record, so the
 * form can be handed straight to saveDeliveryProfile.
 */
function DeliveryAddressFields({ values, onChange, disabled = false, emailReadOnly = false }) {
  const set = (field) => (event) => onChange(field, event.target.value)

  return (
    <div className="delivery-fields">
      <div className="delivery-row">
        <label>
          Full name
          <input
            value={values.name || ''}
            onChange={set('name')}
            autoComplete="name"
            disabled={disabled}
            required
          />
        </label>
        <label>
          Phone
          <input
            value={values.phone || ''}
            onChange={set('phone')}
            placeholder="10-digit mobile"
            inputMode="numeric"
            autoComplete="tel"
            disabled={disabled}
            required
          />
        </label>
      </div>

      <label>
        Email
        <input
          type="email"
          value={values.email || ''}
          onChange={set('email')}
          autoComplete="email"
          disabled={disabled || emailReadOnly}
          readOnly={emailReadOnly}
          required
        />
      </label>

      <label>
        House / flat number, building
        <input
          value={values.address_line1 || ''}
          onChange={set('address_line1')}
          placeholder="e.g. 12B, Sunrise Apartments"
          autoComplete="address-line1"
          disabled={disabled}
          required
        />
      </label>

      <label>
        Street, area
        <input
          value={values.address_line2 || ''}
          onChange={set('address_line2')}
          placeholder="e.g. MG Road, Indiranagar"
          autoComplete="address-line2"
          disabled={disabled}
        />
      </label>

      <label>
        Landmark <span className="field-optional">(optional)</span>
        <input
          value={values.landmark || ''}
          onChange={set('landmark')}
          placeholder="e.g. opposite the metro station"
          disabled={disabled}
        />
      </label>

      <div className="delivery-row delivery-row-three">
        <label>
          City
          <input
            value={values.city || ''}
            onChange={set('city')}
            autoComplete="address-level2"
            disabled={disabled}
            required
          />
        </label>
        <label>
          State
          <select
            value={values.state || ''}
            onChange={set('state')}
            autoComplete="address-level1"
            disabled={disabled}
            required
          >
            <option value="">Select</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pincode
          <input
            value={values.pincode || ''}
            onChange={set('pincode')}
            placeholder="560001"
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            disabled={disabled}
            required
          />
        </label>
      </div>
    </div>
  )
}

export default DeliveryAddressFields
