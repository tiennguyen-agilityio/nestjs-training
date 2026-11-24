import { z } from 'zod';
import { VALIDATION_RULES } from '@repo/constants';

const { SIZE, PRICE, DISCOUNT, STOCK_QUANTITY } = VALIDATION_RULES;

// Bare rules on numbers; the API coerces its input into them.
export const sizeField = z.number().min(SIZE.MIN).max(SIZE.MAX);

export const priceField = z.number().min(PRICE.MIN).max(PRICE.MAX);

export const discountValueField = z
  .number()
  .min(DISCOUNT.MIN)
  .max(DISCOUNT.MAX);

export const stockQuantityField = z.int().min(STOCK_QUANTITY.MIN);
