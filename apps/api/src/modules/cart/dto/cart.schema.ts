import { z } from 'zod';
import { addCartItemSchema, updateCartItemSchema } from '@repo/schemas';

export { addCartItemSchema, updateCartItemSchema };

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
