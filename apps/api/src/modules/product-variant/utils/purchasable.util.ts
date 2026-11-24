import { ProductStatus } from '@repo/constants';
import type { ProductVariant } from '../entities/product-variant.entity.js';

/** A variant can be bought: it and its product exist, are not deleted, and the product is ACTIVE. */
export const isPurchasable = (
  variant: ProductVariant | null | undefined,
): variant is ProductVariant => {
  const product = variant?.product;
  return (
    !!variant &&
    !variant.deletedAt &&
    !!product &&
    !product.deletedAt &&
    (product.status as ProductStatus) === ProductStatus.ACTIVE
  );
};
