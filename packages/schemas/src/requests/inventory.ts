import { z } from 'zod';
import { VALIDATION_RULES } from '@repo/constants';

const { STOCK_QUANTITY, INVENTORY } = VALIDATION_RULES;

// Restock adds units; it takes no reason.
export const restockStockSchema = z.object({
  quantity: z.int().min(1).max(STOCK_QUANTITY.MAX),
});

// Adjust adds (positive) or removes (negative) units, with a reason.
export const adjustStockSchema = z.object({
  quantity: z
    .int()
    .min(-STOCK_QUANTITY.MAX)
    .max(STOCK_QUANTITY.MAX)
    .refine((quantity) => quantity !== 0),
  reason: z.string().trim().min(INVENTORY.REASON.MIN).max(INVENTORY.REASON.MAX),
});

export type RestockStockPayload = z.input<typeof restockStockSchema>;
export type AdjustStockPayload = z.input<typeof adjustStockSchema>;
