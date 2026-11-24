import { z } from 'zod';
import {
  addCartItemSchema,
  mergeCartSchema,
  updateCartItemSchema,
} from '@repo/schemas';

export { addCartItemSchema, mergeCartSchema, updateCartItemSchema };

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export type MergeCartInput = z.infer<typeof mergeCartSchema>;
