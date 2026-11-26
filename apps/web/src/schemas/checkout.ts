import { VALIDATION_MESSAGES, VALIDATION_RULES } from '@repo/constants'
import { z } from 'zod'

import { ERROR_MESSAGES, FORM_MESSAGES } from '@/constants/messages'
import { PAYMENT_METHOD, type CheckoutFormValues } from '@/types/checkout'

// const cardNumberRegex = /^\d{13,19}$/
// const expiryDateRegex = /^(0[1-9]|1[0-2])\/\d{2}$/
// const cvcRegex = /^\d{3,4}$/

const { ADDRESS_MAX_LENGTH, POSTAL_CODE_MAX_LENGTH } = VALIDATION_RULES.ORDER

const addressPart = (label: string, requiredMessage: string) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(ADDRESS_MAX_LENGTH, FORM_MESSAGES.maxLength(label, ADDRESS_MAX_LENGTH))

export const checkoutSchema = z
  .object({
    firstName: z.string().trim().min(1, ERROR_MESSAGES.FIRST_NAME_REQUIRED),
    lastName: z.string().trim().min(1, ERROR_MESSAGES.LAST_NAME_REQUIRED),
    phoneNumber: z
      .string()
      .trim()
      .min(1, ERROR_MESSAGES.PHONE_NUMBER_REQUIRED)
      .regex(
        VALIDATION_RULES.PHONE.REGEX,
        VALIDATION_MESSAGES.invalidFormat('Phone'),
      ),
    addressLine: addressPart('Address', ERROR_MESSAGES.ADDRESS_REQUIRED),
    city: addressPart('City', ERROR_MESSAGES.CITY_REQUIRED),
    district: addressPart('District', ERROR_MESSAGES.DISTRICT_REQUIRED),
    ward: addressPart('Ward', ERROR_MESSAGES.WARD_REQUIRED),
    postalCode: z
      .string()
      .trim()
      .min(1, ERROR_MESSAGES.POSTAL_CODE_REQUIRED)
      .max(
        POSTAL_CODE_MAX_LENGTH,
        FORM_MESSAGES.maxLength('Postal code', POSTAL_CODE_MAX_LENGTH),
      ),
    paymentMethod: z.nativeEnum(PAYMENT_METHOD),
    // cardNumber: z.string().trim(),
    // expiryDate: z.string().trim(),
    // cvc: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    const recipientName = [values.firstName, values.lastName]
      .filter(Boolean)
      .join(' ')
    if (recipientName.length > VALIDATION_RULES.NAME.MAX_LENGTH) {
      for (const field of ['firstName', 'lastName'] as const) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: ERROR_MESSAGES.RECIPIENT_NAME_TOO_LONG,
        })
      }
    }

    if (values.paymentMethod !== PAYMENT_METHOD.STRIPE) {
      return
    }

    // if (!values.cardNumber) {
    //   ctx.addIssue({
    //     code: z.ZodIssueCode.custom,
    //     path: ['cardNumber'],
    //     message: ERROR_MESSAGES.CARD_NUMBER_REQUIRED,
    //   })
    // } else if (!cardNumberRegex.test(values.cardNumber.replace(/\s+/g, ''))) {
    //   ctx.addIssue({
    //     code: z.ZodIssueCode.custom,
    //     path: ['cardNumber'],
    //     message: ERROR_MESSAGES.CARD_NUMBER_INVALID,
    //   })
    // }

    // if (!values.expiryDate) {
    //   ctx.addIssue({
    //     code: z.ZodIssueCode.custom,
    //     path: ['expiryDate'],
    //     message: ERROR_MESSAGES.EXPIRY_DATE_REQUIRED,
    //   })
    // } else if (!expiryDateRegex.test(values.expiryDate)) {
    //   ctx.addIssue({
    //     code: z.ZodIssueCode.custom,
    //     path: ['expiryDate'],
    //     message: ERROR_MESSAGES.EXPIRY_DATE_INVALID,
    //   })
    // }

    // if (!values.cvc) {
    //   ctx.addIssue({
    //     code: z.ZodIssueCode.custom,
    //     path: ['cvc'],
    //     message: ERROR_MESSAGES.CVC_REQUIRED,
    //   })
    // } else if (!cvcRegex.test(values.cvc)) {
    //   ctx.addIssue({
    //     code: z.ZodIssueCode.custom,
    //     path: ['cvc'],
    //     message: ERROR_MESSAGES.CVC_INVALID,
    //   })
    // }
  })

export const parseCheckoutValues = (values: CheckoutFormValues) =>
  checkoutSchema.safeParse(values)

/** The first schema message for one field (a blur check), or undefined. */
export const validateCheckoutField = (
  values: CheckoutFormValues,
  field: keyof CheckoutFormValues,
): string | undefined => {
  const result = checkoutSchema.safeParse(values)
  if (result.success) return undefined
  return result.error.issues.find((issue) => issue.path[0] === field)?.message
}
