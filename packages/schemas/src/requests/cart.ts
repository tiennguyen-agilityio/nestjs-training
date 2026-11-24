import { z } from 'zod';
import { cartQuantityField } from '../fields/number.js';

export const addCartItemSchema = z.object({
  productVariantId: z.uuid(),
  quantity: cartQuantityField.default(1),
});

// Sets the line's quantity; removing a line has its own route.
export const updateCartItemSchema = z.object({
  quantity: cartQuantityField,
});

export type AddCartItemPayload = z.input<typeof addCartItemSchema>;
export type UpdateCartItemPayload = z.input<typeof updateCartItemSchema>;
