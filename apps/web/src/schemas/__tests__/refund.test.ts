import { ERROR_MESSAGES } from '@/constants/messages'
import { refundFormSchema } from '@/schemas/refund'

const messageOf = (amount: unknown, max = 24) => {
  const result = refundFormSchema(max).safeParse({ amount, reason: 'Fee' })
  return result.success ? undefined : result.error.issues[0]?.message
}

describe('refundFormSchema', () => {
  it('refundFormSchema accepts up to the max with 2 decimals and refuses more', () => {
    expect(messageOf(24)).toBeUndefined()
    expect(messageOf(0.01)).toBeUndefined()
    expect(messageOf(12.5)).toBeUndefined()
    expect(messageOf(24.01)).toBe(ERROR_MESSAGES.REFUND_AMOUNT_MAX('24.00'))
    expect(messageOf(0)).toBe(ERROR_MESSAGES.REFUND_AMOUNT_MIN)
    expect(messageOf(1.234)).toBe(ERROR_MESSAGES.REFUND_AMOUNT_DECIMALS)
  })
  it('refundFormSchema requires a reason below the max and caps it at 500', () => {
    const reasonMessageOf = (amount: number, reason: string) => {
      const result = refundFormSchema(24).safeParse({ amount, reason })
      return result.success ? undefined : result.error.issues[0]?.message
    }

    expect(reasonMessageOf(24, '')).toBeUndefined()
    expect(reasonMessageOf(20, 'Cancellation fee')).toBeUndefined()
    expect(reasonMessageOf(20, '')).toBe(ERROR_MESSAGES.REFUND_REASON_REQUIRED)
    expect(reasonMessageOf(20, '   ')).toBe(
      ERROR_MESSAGES.REFUND_REASON_REQUIRED,
    )
    expect(reasonMessageOf(24, 'a'.repeat(501))).toBe(
      ERROR_MESSAGES.REFUND_REASON_MAX,
    )
    expect(
      refundFormSchema(24).parse({ amount: 20, reason: ' Fee ' }).reason,
    ).toBe('Fee')
  })
})
