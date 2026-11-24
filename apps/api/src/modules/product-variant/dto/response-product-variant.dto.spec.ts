import { DiscountType, ProductUnit } from '@repo/constants';
import { ResponseProductVariantDto } from './response-product-variant.dto.js';
import type { ProductVariant } from '../entities/product-variant.entity.js';

const variant = (overrides: Partial<ProductVariant>): ProductVariant =>
  ({
    id: 'variant-id-1',
    sku: 'SKU-1',
    size: '250.00',
    unit: ProductUnit.G,
    price: '120.00',
    discountType: DiscountType.PERCENT,
    discountValue: '10.00',
    stockQuantity: 30,
    ...overrides,
  }) as ProductVariant;

describe('ResponseProductVariantDto', () => {
  it('works the name out from size and unit', () => {
    const dto = ResponseProductVariantDto.fromEntity(
      variant({ size: '250.00', unit: ProductUnit.G, stockQuantity: 37 }),
    );

    expect(dto).toMatchObject({
      size: 250,
      unit: 'G',
      name: '250g',
      stockQuantity: 37,
    });
    expect(dto).not.toHaveProperty('weight');
    expect(dto).not.toHaveProperty('quantity');
  });

  it('reads a null discount as PERCENT 0', () => {
    expect(
      ResponseProductVariantDto.fromEntity(
        variant({ discountType: null, discountValue: null }),
      ),
    ).toMatchObject({ discountType: DiscountType.PERCENT, discountValue: 0 });
  });

  it('reads FIXED with a null value as FIXED 0', () => {
    expect(
      ResponseProductVariantDto.fromEntity(
        variant({ discountType: DiscountType.FIXED, discountValue: null }),
      ),
    ).toMatchObject({ discountType: DiscountType.FIXED, discountValue: 0 });
  });

  it('reads a null type with a value as PERCENT with that value', () => {
    expect(
      ResponseProductVariantDto.fromEntity(
        variant({ discountType: null, discountValue: '10.00' }),
      ),
    ).toMatchObject({ discountType: DiscountType.PERCENT, discountValue: 10 });
  });

  it('keeps a stored discount', () => {
    expect(
      ResponseProductVariantDto.fromEntity(
        variant({ discountType: DiscountType.FIXED, discountValue: '12.50' }),
      ),
    ).toMatchObject({ discountType: DiscountType.FIXED, discountValue: 12.5 });
  });

  it('includes the audit ids with withAudit', () => {
    expect(
      ResponseProductVariantDto.fromEntity(
        variant({
          createdBy: 'admin-1',
          updatedBy: 'admin-2',
          deletedBy: null,
        }),
        { withAudit: true },
      ),
    ).toMatchObject({
      createdBy: 'admin-1',
      updatedBy: 'admin-2',
      deletedBy: null,
    });
  });

  it('has no audit keys without withAudit', () => {
    const json = JSON.parse(
      JSON.stringify(
        ResponseProductVariantDto.fromEntity(variant({ createdBy: 'admin-1' })),
      ),
    ) as Record<string, unknown>;

    expect(json).not.toHaveProperty('createdBy');
    expect(json).not.toHaveProperty('updatedBy');
    expect(json).not.toHaveProperty('deletedBy');
  });
});
