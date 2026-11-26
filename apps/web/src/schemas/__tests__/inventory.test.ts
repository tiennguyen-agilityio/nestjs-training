import { VALIDATION_RULES } from '@repo/constants'

import { ERROR_MESSAGES, FORM_MESSAGES } from '@/constants/messages'
import { adjustFormSchema, restockFormSchema } from '@/schemas/inventory'

const { INVENTORY } = VALIDATION_RULES

const messageOf = (
  result: { error?: { issues: { path: PropertyKey[]; message: string }[] } },
  field: string,
) => result.error?.issues.find((issue) => issue.path[0] === field)?.message

describe('restockFormSchema', () => {
  it.each([
    [Number.NaN, ERROR_MESSAGES.FIELD_REQUIRED],
    [1.5, FORM_MESSAGES.isInt('Quantity')],
    [0, FORM_MESSAGES.min('Quantity', 1)],
    [1_000_001, FORM_MESSAGES.max('Quantity', '1,000,000')],
  ])('rejects %p with a form message', (quantity, message) => {
    expect(
      messageOf(restockFormSchema.safeParse({ quantity }), 'quantity'),
    ).toBe(message)
  })

  it('accepts 1 and 1,000,000', () => {
    expect(restockFormSchema.safeParse({ quantity: 1 }).success).toBe(true)
    expect(restockFormSchema.safeParse({ quantity: 1_000_000 }).success).toBe(
      true,
    )
  })
})

describe('adjustFormSchema', () => {
  const valid = { counted: 3, reason: 'Recount' }

  it.each([
    [Number.NaN, ERROR_MESSAGES.FIELD_REQUIRED],
    [-1, FORM_MESSAGES.min('Counted quantity', 0)],
    [2.5, FORM_MESSAGES.isInt('Counted quantity')],
    [1_000_001, FORM_MESSAGES.max('Counted quantity', '1,000,000')],
  ])(
    'rejects a counted quantity of %p with a form message',
    (counted, message) => {
      expect(
        messageOf(adjustFormSchema.safeParse({ ...valid, counted }), 'counted'),
      ).toBe(message)
    },
  )

  it.each([
    ['   ', ERROR_MESSAGES.FIELD_REQUIRED],
    ['a', FORM_MESSAGES.minLength('Reason', INVENTORY.REASON.MIN)],
    [
      'a'.repeat(INVENTORY.REASON.MAX + 1),
      FORM_MESSAGES.maxLength('Reason', INVENTORY.REASON.MAX),
    ],
  ])('rejects the reason %p with a form message', (reason, message) => {
    expect(
      messageOf(adjustFormSchema.safeParse({ ...valid, reason }), 'reason'),
    ).toBe(message)
  })

  it('accepts a count of 0 and a trimmed reason', () => {
    const result = adjustFormSchema.safeParse({ counted: 0, reason: '  ok  ' })

    expect(result.success).toBe(true)
    expect(result.data?.reason).toBe('ok')
  })
})
