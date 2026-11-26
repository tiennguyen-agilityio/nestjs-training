import { z } from 'zod'

import { VALIDATION_RULES } from '@repo/constants'
import { ERROR_MESSAGES, FORM_MESSAGES } from '@/constants/messages'
import { formatNumberThousands } from '@/utils/number'

const { STOCK_QUANTITY, INVENTORY } = VALIDATION_RULES

const RESTOCK_MIN = 1

const wholeNumberInRange = (label: string, min: number) =>
  z
    .number({ error: ERROR_MESSAGES.FIELD_REQUIRED })
    .int({ message: FORM_MESSAGES.isInt(label) })
    .min(min, { message: FORM_MESSAGES.min(label, min) })
    .max(STOCK_QUANTITY.MAX, {
      message: FORM_MESSAGES.max(
        label,
        formatNumberThousands(STOCK_QUANTITY.MAX, 0),
      ),
    })

export const restockFormSchema = z.object({
  quantity: wholeNumberInRange('Quantity', RESTOCK_MIN),
})

export type RestockFormValues = z.infer<typeof restockFormSchema>

export const adjustFormSchema = z.object({
  counted: wholeNumberInRange('Counted quantity', STOCK_QUANTITY.MIN),
  reason: z
    .string()
    .trim()
    .min(1, { message: ERROR_MESSAGES.FIELD_REQUIRED })
    .min(INVENTORY.REASON.MIN, {
      message: FORM_MESSAGES.minLength('Reason', INVENTORY.REASON.MIN),
    })
    .max(INVENTORY.REASON.MAX, {
      message: FORM_MESSAGES.maxLength('Reason', INVENTORY.REASON.MAX),
    }),
})

export type AdjustFormValues = z.infer<typeof adjustFormSchema>
