import { z } from 'zod';
import { InventoryMovementType } from '@repo/constants';
import { adjustStockSchema, restockStockSchema } from '@repo/schemas';
import { paginationQuerySchema } from '../../../common/dto/pagination.schema.js';

// Only "true"/"false": `z.coerce.boolean()` reads "false" as true.
const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const inventoryQuerySchema = paginationQuerySchema.extend({
  lowStock: booleanFlag,
  activeOnly: booleanFlag,
  sort: z
    .enum(['availableQuantity', 'stockQuantity', 'sku'])
    .default('availableQuantity'),
  order: z.enum(['ASC', 'DESC']).default('ASC'),
});

export type InventoryQueryInput = z.infer<typeof inventoryQuerySchema>;

export type InventoryFilters = Omit<InventoryQueryInput, 'page' | 'limit'>;

export const movementQuerySchema = paginationQuerySchema
  .omit({ search: true })
  .extend({ type: z.enum(InventoryMovementType).optional() });

export type MovementQueryInput = z.infer<typeof movementQuerySchema>;

export { adjustStockSchema, restockStockSchema };

export type RestockStockInput = z.infer<typeof restockStockSchema>;

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
