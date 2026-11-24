import { z } from 'zod';
import { ProductSortBy, ShippingMethodStatus } from '@repo/constants';
import {
  createShippingMethodSchema,
  updateShippingMethodSchema,
} from '@repo/schemas';
import {
  paginationQuerySchema,
  type PaginationQueryInput,
} from '../../../common/dto/pagination.schema.js';

export { createShippingMethodSchema, updateShippingMethodSchema };

export type CreateShippingMethodInput = z.infer<
  typeof createShippingMethodSchema
>;

export type UpdateShippingMethodInput = z.infer<
  typeof updateShippingMethodSchema
>;

export const shippingMethodQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ShippingMethodStatus).optional(),
  sortBy: z.enum(ProductSortBy).optional(),
});

export type ShippingMethodQueryInput = z.infer<
  typeof shippingMethodQuerySchema
>;

export type ShippingMethodFilters = Omit<
  ShippingMethodQueryInput,
  keyof PaginationQueryInput
>;
