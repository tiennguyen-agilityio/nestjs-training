import { ShippingMethodStatus, VALIDATION_RULES } from '@repo/constants'

import { ERROR_MESSAGES, FORM_MESSAGES } from '@/constants/messages'
import { shippingMethodFormSchema } from '@/schemas/shippingMethod'

const valid = {
  name: 'Same day',
  description: 'Today',
  price: 25,
  status: ShippingMethodStatus.ACTIVE,
}

const firstError = (input: unknown, field: string) => {
  const result = shippingMethodFormSchema.safeParse(input)
  if (result.success) return undefined
  return result.error.issues.find((issue) => issue.path[0] === field)?.message
}

describe('shippingMethodFormSchema', () => {
  it('accepts 0 and 12.34', () => {
    expect(
      shippingMethodFormSchema.safeParse({ ...valid, price: 0 }).success,
    ).toBe(true)
    const result = shippingMethodFormSchema.safeParse({
      ...valid,
      price: 12.34,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.price).toBe(12.34)
  })

  it('rejects -1 and 12.345', () => {
    expect(firstError({ ...valid, price: -1 }, 'price')).toBe(
      FORM_MESSAGES.min('Fee', VALIDATION_RULES.SHIPPING_PRICE.MIN),
    )
    expect(firstError({ ...valid, price: 12.345 }, 'price')).toBe(
      FORM_MESSAGES.maxDecimals('Fee', 2),
    )
  })

  it('requires a fee', () => {
    expect(firstError({ ...valid, price: '' }, 'price')).toBe(
      ERROR_MESSAGES.FIELD_REQUIRED,
    )
    expect(
      firstError({ name: 'Same day', description: 'Today' }, 'price'),
    ).toBe(ERROR_MESSAGES.FIELD_REQUIRED)
  })

  it('refuses a name of only spaces', () => {
    expect(firstError({ ...valid, name: '   ' }, 'name')).toBe(
      ERROR_MESSAGES.FIELD_REQUIRED,
    )
    expect(firstError({ ...valid, description: '  ' }, 'description')).toBe(
      ERROR_MESSAGES.FIELD_REQUIRED,
    )
  })

  it('refuses a name over the maximum', () => {
    const { NAME } = VALIDATION_RULES
    expect(
      firstError({ ...valid, name: 'a'.repeat(NAME.MAX_LENGTH + 1) }, 'name'),
    ).toBe(FORM_MESSAGES.maxLength('Name', NAME.MAX_LENGTH))
    expect(firstError({ ...valid, description: 'a' }, 'description')).toBe(
      FORM_MESSAGES.minLength('Description', NAME.MIN_LENGTH),
    )
  })

  it('requires a status', () => {
    const { status: _status, ...withoutStatus } = valid
    expect(firstError(withoutStatus, 'status')).toBe(
      ERROR_MESSAGES.FIELD_REQUIRED,
    )
  })

  it('accepts ACTIVE and INACTIVE only', () => {
    const result = shippingMethodFormSchema.safeParse({
      ...valid,
      status: ShippingMethodStatus.INACTIVE,
    })
    expect(result.success && result.data.status).toBe(
      ShippingMethodStatus.INACTIVE,
    )
    expect(firstError({ ...valid, status: 'PAUSED' }, 'status')).toBe(
      ERROR_MESSAGES.FIELD_REQUIRED,
    )
    expect(firstError({ ...valid, status: null }, 'status')).toBe(
      ERROR_MESSAGES.FIELD_REQUIRED,
    )
  })

  it('trims the name and description', () => {
    const result = shippingMethodFormSchema.safeParse({
      ...valid,
      name: '  Same day ',
      description: ' Today ',
    })
    expect(result.success && result.data).toEqual(valid)
  })
})
