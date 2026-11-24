import { z } from 'zod';
import { placeOrderSchema } from '@repo/schemas';

export { placeOrderSchema };

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
