import { ProductStatus } from '@repo/constants';
import { isPurchasable } from './purchasable.util.js';
import type { ProductVariant } from '../entities/product-variant.entity.js';

describe('isPurchasable', () => {
  const variantOf = (
    product: { status: ProductStatus; deletedAt?: Date | null },
    deletedAt: Date | null = null,
  ): ProductVariant =>
    ({
      id: 'variant-1',
      deletedAt,
      product: { deletedAt: null, ...product },
    }) as ProductVariant;

  it('isPurchasable is true for a live variant of an ACTIVE product', () => {
    expect(isPurchasable(variantOf({ status: ProductStatus.ACTIVE }))).toBe(
      true,
    );
  });

  it.each([
    ['missing', null],
    ['undefined', undefined],
    [
      'a deleted variant',
      variantOf({ status: ProductStatus.ACTIVE }, new Date()),
    ],
    [
      'a deleted product',
      variantOf({ status: ProductStatus.ACTIVE, deletedAt: new Date() }),
    ],
    ['a DRAFT product', variantOf({ status: ProductStatus.DRAFT })],
    ['an INACTIVE product', variantOf({ status: ProductStatus.INACTIVE })],
    ['an ARCHIVED product', variantOf({ status: ProductStatus.ARCHIVED })],
  ])(
    'isPurchasable is false for a missing, deleted or non-ACTIVE variant (%s)',
    (_case, variant) => {
      expect(isPurchasable(variant)).toBe(false);
    },
  );
});
