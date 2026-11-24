import { z } from 'zod';
import {
  OrderPaymentStatus,
  OrderStatus,
  ShippingStatus,
} from '@repo/constants';
import { placeOrderSchema } from '@repo/schemas';
import { paginationQuerySchema } from '../../../common/dto/pagination.schema.js';

export { placeOrderSchema };

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

// The caller's own orders, or every order for an active admin with `all=true`.
export const orderQuerySchema = paginationQuerySchema.extend({
  status: z.enum(OrderStatus).optional(),
  shippingStatus: z.enum(ShippingStatus).optional(),
  paymentStatus: z.enum(OrderPaymentStatus).optional(),
  sort: z.enum(['createdAt', 'totalAmount']).default('createdAt'),
  order: z.enum(['ASC', 'DESC']).default('DESC'),
  // Only "true"/"false": `z.coerce.boolean()` reads "false" as true.
  all: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type OrderQueryInput = z.infer<typeof orderQuerySchema>;

export type OrderFilters = Omit<OrderQueryInput, 'page' | 'limit' | 'all'>;

export const orderParamSchema = z.object({
  idOrOrderNumber: z.string().trim().min(1),
});

export type OrderParam = z.infer<typeof orderParamSchema>;
