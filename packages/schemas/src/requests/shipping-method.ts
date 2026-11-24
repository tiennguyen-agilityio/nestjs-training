import { z } from 'zod';
import { ShippingMethodStatus, VALIDATION_RULES } from '@repo/constants';

const { NAME, SHIPPING_PRICE } = VALIDATION_RULES;

// Name and description are trimmed before their length checks.
export const createShippingMethodSchema = z.object({
  name: z.string().trim().min(NAME.MIN_LENGTH).max(NAME.MAX_LENGTH),
  description: z.string().trim().min(NAME.MIN_LENGTH),
  price: z
    .number()
    .min(SHIPPING_PRICE.MIN)
    .max(SHIPPING_PRICE.MAX)
    .multipleOf(SHIPPING_PRICE.STEP),
  status: z.enum(ShippingMethodStatus).optional(),
});

export const updateShippingMethodSchema = createShippingMethodSchema.partial();

export type CreateShippingMethodPayload = z.input<
  typeof createShippingMethodSchema
>;
export type UpdateShippingMethodPayload = z.input<
  typeof updateShippingMethodSchema
>;
