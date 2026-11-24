import type { ProductUnit } from '@repo/constants';

// The variant name (Size Name) is worked out on read, never stored:
// "250.00" G → "250g", "1.50" KG → "1.5kg".
export const variantNameFrom = (
  size: string | number,
  unit: ProductUnit,
): string => `${Number(size)}${unit.toLowerCase()}`;
