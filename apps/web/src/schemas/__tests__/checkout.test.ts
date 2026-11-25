import { VALIDATION_MESSAGES } from '@repo/constants'

import { ERROR_MESSAGES } from '@/constants/messages'
import { parseCheckoutValues, validateCheckoutField } from '@/schemas/checkout'
import { PAYMENT_METHOD, type CheckoutFormValues } from '@/types/checkout'

const values = (phoneNumber: string): CheckoutFormValues => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  phoneNumber,
  addressLine: '1 Analytical St',
  city: 'London',
  district: 'Marylebone',
  ward: 'Ward 1',
  postalCode: 'NW1',
  paymentMethod: PAYMENT_METHOD.COD,
  cardNumber: '',
  expiryDate: '',
  cvc: '',
})

describe('parseCheckoutValues', () => {
  it('rejects a phone that is not 10 digits', () => {
    const result = parseCheckoutValues(values('09123'))

    expect(result.success).toBe(false)
    expect(
      result.error?.issues.find((issue) => issue.path[0] === 'phoneNumber')
        ?.message,
    ).toBe(VALIDATION_MESSAGES.invalidFormat('Phone'))
  })

  it('accepts a 10-digit phone', () => {
    expect(parseCheckoutValues(values('0912345678')).success).toBe(true)
  })
})

describe('validateCheckoutField', () => {
  it('returns the message for that field only', () => {
    const invalid = { ...values('09123'), firstName: ' ' }

    expect(validateCheckoutField(invalid, 'firstName')).toBe(
      ERROR_MESSAGES.FIRST_NAME_REQUIRED,
    )
    expect(validateCheckoutField(invalid, 'phoneNumber')).toBe(
      VALIDATION_MESSAGES.invalidFormat('Phone'),
    )
    expect(validateCheckoutField(invalid, 'city')).toBeUndefined()
  })
})
