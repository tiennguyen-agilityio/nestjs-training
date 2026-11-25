import { z } from 'zod'

import { ERROR_MESSAGES } from '@/constants/messages'

const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6

/** The admin's refund amount: above 0, at most `max`, at most 2 decimals. */
export const refundFormSchema = (max: number) =>
  z.object({
    amount: z
      .number({ error: ERROR_MESSAGES.REFUND_AMOUNT_MIN })
      .min(0.01, { message: ERROR_MESSAGES.REFUND_AMOUNT_MIN })
      .refine(hasAtMostTwoDecimals, {
        message: ERROR_MESSAGES.REFUND_AMOUNT_DECIMALS,
      })
      .refine((value) => value <= max, {
        message: ERROR_MESSAGES.REFUND_AMOUNT_MAX(max.toFixed(2)),
      }),
  })

export type RefundFormValues = z.infer<ReturnType<typeof refundFormSchema>>
