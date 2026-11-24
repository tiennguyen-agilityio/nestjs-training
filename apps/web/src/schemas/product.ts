import { z } from 'zod'

import {
  VALIDATION_RULES,
  DiscountType,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'
import { isDiscountFixedValid, isDiscountPercentValid } from '@repo/schemas'
import { ERROR_MESSAGES, FORM_MESSAGES } from '@/constants/messages'
import { QUANTITY_MAX } from '@/constants/product'
import { formatNumberThousands } from '@/utils/number'

const { NAME, PRICE, SIZE, DISCOUNT, STOCK_QUANTITY } = VALIDATION_RULES

// Exact bound with thousand separators, e.g. 99999999.99 -> "99,999,999.99":
// formatting is the UI's job, the shared message only interpolates it.
const formatBound = (value: number) =>
  formatNumberThousands(value, Number.isInteger(value) ? 0 : 2)

const numberInRange = (label: string, min: number, max: number) =>
  z
    .number({ error: ERROR_MESSAGES.FIELD_REQUIRED })
    .refine((value) => Number.isFinite(value) && value >= min, {
      message: FORM_MESSAGES.min(label, formatBound(min)),
    })
    .refine((value) => Number.isFinite(value) && value <= max, {
      message: FORM_MESSAGES.max(label, formatBound(max)),
    })

// label is the field's name as the form shows it.
const textFieldSchema = (
  label: string,
  minLength: number,
  maxLength?: number,
) => {
  let schema = z
    .string()
    .trim()
    .min(1, { message: ERROR_MESSAGES.FIELD_REQUIRED })
    .min(minLength, {
      message: FORM_MESSAGES.minLength(label, minLength),
    })

  if (maxLength !== undefined) {
    schema = schema.max(maxLength, {
      message: FORM_MESSAGES.maxLength(label, maxLength),
    })
  }

  return schema
}

const nameSchema = textFieldSchema(
  'Product name',
  NAME.MIN_LENGTH,
  NAME.MAX_LENGTH,
)
const descriptionSchema = textFieldSchema('Description', NAME.MIN_LENGTH)
const originSchema = textFieldSchema('Origin', NAME.MIN_LENGTH)
const processingMethodSchema = textFieldSchema(
  'Processing method',
  NAME.MIN_LENGTH,
)

// Stock quantity as the input holds it ('' when empty). `max` is the Add
// form's web-only cap; Edit has none, like the API, so existing stock saves.
const stockQuantitySchema = (max?: number) => {
  let stock = z
    .number()
    .int({ message: FORM_MESSAGES.isInt('Quantity') })
    .min(STOCK_QUANTITY.MIN, {
      message: FORM_MESSAGES.min('Quantity', STOCK_QUANTITY.MIN),
    })
  if (max !== undefined) {
    stock = stock.max(max, {
      message: FORM_MESSAGES.max('Quantity', max),
    })
  }
  return z
    .union([z.literal(''), stock], { error: ERROR_MESSAGES.FIELD_REQUIRED })
    .refine((value) => value !== '', {
      message: ERROR_MESSAGES.FIELD_REQUIRED,
    })
}

// Size and unit of a product's (first) variant, shared by the Create and
// Edit forms.
const sizeFields = {
  size: z
    .union([z.literal(''), numberInRange('Size', SIZE.MIN, SIZE.MAX)], {
      error: ERROR_MESSAGES.FIELD_REQUIRED,
    })
    .refine((value) => value !== '', {
      message: ERROR_MESSAGES.FIELD_REQUIRED,
    }),
  unit: z
    .union([z.literal(''), z.nativeEnum(ProductUnit)], {
      error: ERROR_MESSAGES.FIELD_REQUIRED,
    })
    .refine((value) => value !== '', {
      message: ERROR_MESSAGES.FIELD_REQUIRED,
    }),
}

// Price, discount and stock of a product's (first) variant, shared by the
// Create and Edit forms, with both discount rules on discountValue.
const pricingFields = {
  price: numberInRange('Base price', PRICE.MIN, PRICE.MAX),
  discountType: z.nativeEnum(DiscountType),
  discountValue: numberInRange('Discount', DISCOUNT.MIN, DISCOUNT.MAX),
  stockQuantity: stockQuantitySchema(),
}

const refinePricing = (
  data: { price: number; discountType: DiscountType; discountValue: number },
  ctx: z.RefinementCtx,
) => {
  if (!isDiscountPercentValid(data)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountValue'],
      message: FORM_MESSAGES.DISCOUNT_PERCENT,
    })
  }

  if (!isDiscountFixedValid(data)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountValue'],
      message: FORM_MESSAGES.DISCOUNT_FIXED,
    })
  }
}

export const createProductFormSchema = z
  .object({
    categoryId: z
      .string()
      .trim()
      .min(1, { message: ERROR_MESSAGES.FIELD_REQUIRED }),
    name: nameSchema,
    description: descriptionSchema,
    roastLevel: z.nativeEnum(RoastLevel),
    isOrganic: z.boolean(),
    isFairTrade: z.boolean(),
    ...sizeFields,
    ...pricingFields,
    stockQuantity: stockQuantitySchema(QUANTITY_MAX),
    origin: originSchema,
    processingMethod: processingMethodSchema,
  })
  .superRefine(refinePricing)

export type CreateProductFormValues = z.infer<typeof createProductFormSchema>

export const editProductFormSchema = z
  .object({
    categoryId: z
      .string()
      .trim()
      .min(1, { message: ERROR_MESSAGES.FIELD_REQUIRED }),
    name: nameSchema,
    description: descriptionSchema,
    roastLevel: z.nativeEnum(RoastLevel),
    isOrganic: z.boolean(),
    isFairTrade: z.boolean(),
    ...sizeFields,
    ...pricingFields,
    origin: originSchema,
    processingMethod: processingMethodSchema,
  })
  .superRefine(refinePricing)

// Form values as the inputs hold them: an empty Size or Stock is ''.
export type EditProductFormValues = z.input<typeof editProductFormSchema>
