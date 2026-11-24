import { z } from 'zod'

import { ShippingMethodStatus, VALIDATION_RULES } from '@repo/constants'
import { ERROR_MESSAGES, FORM_MESSAGES } from '@/constants/messages'
import { formatNumberThousands } from '@/utils/number'

const { NAME, SHIPPING_PRICE } = VALIDATION_RULES

const PRICE_DECIMAL_PLACES = 2

const hasAtMostDecimals = (value: number, places: number) => {
  const scaled = value * 10 ** places
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

const requiredText = (label: string, maxLength?: number) => {
  const text = z
    .string({ error: ERROR_MESSAGES.FIELD_REQUIRED })
    .trim()
    .min(1, { message: ERROR_MESSAGES.FIELD_REQUIRED })
    .min(NAME.MIN_LENGTH, {
      message: FORM_MESSAGES.minLength(label, NAME.MIN_LENGTH),
    })
  return maxLength === undefined
    ? text
    : text.max(maxLength, {
        message: FORM_MESSAGES.maxLength(label, maxLength),
      })
}

const priceField = z
  .union([z.literal(''), z.number()], { error: ERROR_MESSAGES.FIELD_REQUIRED })
  .refine((value) => value !== '', { message: ERROR_MESSAGES.FIELD_REQUIRED })
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value) && value >= SHIPPING_PRICE.MIN, {
    message: FORM_MESSAGES.min('Fee', SHIPPING_PRICE.MIN),
  })
  .refine((value) => value <= SHIPPING_PRICE.MAX, {
    message: FORM_MESSAGES.max(
      'Fee',
      formatNumberThousands(SHIPPING_PRICE.MAX, PRICE_DECIMAL_PLACES),
    ),
  })
  .refine((value) => hasAtMostDecimals(value, PRICE_DECIMAL_PLACES), {
    message: FORM_MESSAGES.maxDecimals('Fee', PRICE_DECIMAL_PLACES),
  })

export const shippingMethodFormSchema = z.object({
  name: requiredText('Name', NAME.MAX_LENGTH),
  description: requiredText('Description'),
  price: priceField,
  status: z.enum(ShippingMethodStatus, {
    error: ERROR_MESSAGES.FIELD_REQUIRED,
  }),
})

export type ShippingMethodFormInput = z.input<typeof shippingMethodFormSchema>
export type ShippingMethodFormValues = z.output<typeof shippingMethodFormSchema>
