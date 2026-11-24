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

// The caller's own orders only: no search, name or userId (ADMIN-wide, #31).
export const orderQuerySchema = paginationQuerySchema
  .omit({ search: true })
  .extend({
    status: z.enum(OrderStatus).optional(),
    shippingStatus: z.enum(ShippingStatus).optional(),
    paymentStatus: z.enum(OrderPaymentStatus).optional(),
    sort: z.enum(['createdAt', 'totalAmount']).default('createdAt'),
    order: z.enum(['ASC', 'DESC']).default('DESC'),
  });

export type OrderQueryInput = z.infer<typeof orderQuerySchema>;

export type OrderFilters = Omit<OrderQueryInput, 'page' | 'limit'>;

export const orderParamSchema = z.object({
  idOrOrderNumber: z.string().trim().min(1),
});

export type OrderParam = z.infer<typeof orderParamSchema>;
