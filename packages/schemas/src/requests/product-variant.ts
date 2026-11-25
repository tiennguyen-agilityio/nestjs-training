import { z } from 'zod';
import { DiscountType, ProductUnit } from '@repo/constants';
import {
  discountValueField,
  priceField,
  sizeField,
  stockQuantityField,
} from '../fields/number.js';
import { skuField } from '../fields/text.js';

// Request bodies may send numbers as strings; decimals are stored as strings.
// Only strings are converted: `z.coerce.number()` would turn null into 0, and
// null must be rejected. `<number>` types the input as a number for payloads.
const decimal = (field: z.ZodNumber) =>
  z
    .preprocess<unknown, z.ZodNumber, number>(
      (value) => (typeof value === 'string' ? Number(value) : value),
      field,
    )
    .transform(String);

// The discount rules need the API's error codes, so the API adds them.
export const createProductVariantSchema = z.object({
  sku: skuField,
  size: decimal(sizeField),
  unit: z.enum(ProductUnit),
  price: decimal(priceField),
  discountType: z.enum(DiscountType).optional(),
  discountValue: decimal(discountValueField).optional(),
  stockQuantity: stockQuantityField.optional(),
});

// An existing variant in a product update: its id, plus any field to change.
export const updateProductVariantSchema = z.object({
  id: z.uuid(),
  size: decimal(sizeField).optional(),
  unit: z.enum(ProductUnit).optional(),
  price: decimal(priceField).optional(),
  discountType: z.enum(DiscountType).optional(),
  discountValue: decimal(discountValueField).optional(),
});

export type CreateProductVariantPayload = z.input<
  typeof createProductVariantSchema
>;
export type UpdateProductVariantPayload = z.input<
  typeof updateProductVariantSchema
>;
