import { z } from 'zod';
import { addCartItemSchema, updateCartItemSchema } from '@repo/schemas';

// No server-only refine: the stock and product checks need the database, so
// they are service rules (CartService).
export { addCartItemSchema, updateCartItemSchema };

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
