import { z } from 'zod';
import { VALIDATION_RULES } from '@repo/constants';
import { cartQuantityField } from '../fields/number.js';

export const addCartItemSchema = z.object({
  productVariantId: z.uuid(),
  quantity: cartQuantityField.default(1),
});

export const updateCartItemSchema = z.object({
  quantity: cartQuantityField,
});

export const mergeCartSchema = z.object({
  items: z
    .array(
      z.object({
        productVariantId: z.uuid(),
        quantity: cartQuantityField,
      }),
    )
    .max(VALIDATION_RULES.CART_MERGE.MAX_ITEMS),
});

export type AddCartItemPayload = z.input<typeof addCartItemSchema>;
export type UpdateCartItemPayload = z.input<typeof updateCartItemSchema>;
export type MergeCartPayload = z.input<typeof mergeCartSchema>;
