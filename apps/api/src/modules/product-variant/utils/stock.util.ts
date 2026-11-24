import type { ProductVariant } from '../entities/product-variant.entity.js';

export const availableQuantityOf = (
  variant: Pick<ProductVariant, 'stockQuantity' | 'reservedQuantity'>,
): number => Math.max(variant.stockQuantity - variant.reservedQuantity, 0);
