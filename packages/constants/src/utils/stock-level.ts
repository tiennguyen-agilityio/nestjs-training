import { StockLevel } from '../enums/order.enum.js';
import { VALIDATION_RULES } from '../validation/validation-rules.js';

/** The level of a variant from its available quantity (stock − reserved). */
export const stockLevelOf = (available: number): StockLevel => {
  if (available <= 0) return StockLevel.OUT;
  if (available <= VALIDATION_RULES.INVENTORY.LOW_STOCK_THRESHOLD) {
    return StockLevel.LOW;
  }
  return StockLevel.OK;
};
