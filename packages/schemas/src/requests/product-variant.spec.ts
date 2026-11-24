import { DiscountType, ProductUnit } from '@repo/constants';
import {
  createProductVariantSchema,
  updateProductVariantSchema,
} from './product-variant.js';

const variant = {
  sku: 'SKU-001',
  size: '250',
  unit: ProductUnit.G,
  price: '12.5',
  discountType: DiscountType.PERCENT,
  discountValue: 99,
};

describe('createProductVariantSchema', () => {
  it('coerces numbers sent as strings and hands decimals over as strings', () => {
    expect(createProductVariantSchema.parse(variant)).toMatchObject({
      size: '250',
      price: '12.5',
      discountValue: '99',
    });
  });

  it('leaves the percent rule to the API', () => {
    expect(
      createProductVariantSchema.safeParse({ ...variant, discountValue: 100 })
        .success,
    ).toBe(true);
  });

  it('rejects a null discountValue', () => {
    const result = createProductVariantSchema.safeParse({
      ...variant,
      discountValue: null,
    });

    expect(result.error?.issues.map(({ path }) => path)).toEqual([
      ['discountValue'],
    ]);
  });

  it('rejects a null discountType', () => {
    const result = createProductVariantSchema.safeParse({
      ...variant,
      discountType: null,
    });

    expect(result.error?.issues.map(({ path }) => path)).toEqual([
      ['discountType'],
    ]);
  });

  it('accepts a variant without discount fields', () => {
    const { sku, size, unit, price } = variant;

    expect(
      createProductVariantSchema.safeParse({ sku, size, unit, price }).success,
    ).toBe(true);
  });

  it('takes size and stockQuantity', () => {
    expect(
      createProductVariantSchema.parse({
        sku: 'S1',
        size: '250',
        unit: 'G',
        price: '12',
        stockQuantity: 10,
      }),
    ).toMatchObject({ size: '250', stockQuantity: 10 });

    const withoutStock = createProductVariantSchema.parse({
      sku: 'S1',
      size: '250',
      unit: 'G',
      price: '12',
    });

    expect(withoutStock).not.toHaveProperty('stockQuantity');
  });

  it('rejects a body with weight and no size', () => {
    const result = createProductVariantSchema.safeParse({
      sku: 'S1',
      weight: '250',
      unit: 'G',
      price: '12',
    });

    expect(result.error?.issues.map(({ path }) => path)).toEqual([['size']]);
  });

  it('rejects a non-numeric price', () => {
    const result = createProductVariantSchema.safeParse({
      ...variant,
      price: 'abc',
    });

    expect(result.error?.issues.map(({ path }) => path)).toEqual([['price']]);
  });
});

describe('updateProductVariantSchema', () => {
  const id = '7d5b1c1e-1d2f-4c6a-9b1e-2f3a4b5c6d7e';

  it('accepts an id with only stockQuantity', () => {
    expect(updateProductVariantSchema.parse({ id, stockQuantity: 50 })).toEqual(
      {
        id,
        stockQuantity: 50,
      },
    );
  });

  it('update takes size, unit and stockQuantity', () => {
    expect(
      updateProductVariantSchema.parse({
        id,
        size: 500,
        unit: 'KG',
        stockQuantity: 5,
      }),
    ).toEqual({ id, size: '500', unit: 'KG', stockQuantity: 5 });
  });

  it('rejects a null discountType', () => {
    const result = updateProductVariantSchema.safeParse({
      id,
      discountType: null,
    });

    expect(result.error?.issues.map(({ path }) => path)).toEqual([
      ['discountType'],
    ]);
  });

  it('rejects a null discountValue', () => {
    const result = updateProductVariantSchema.safeParse({
      id,
      discountValue: null,
    });

    expect(result.error?.issues.map(({ path }) => path)).toEqual([
      ['discountValue'],
    ]);
  });

  it('coerces string numbers', () => {
    expect(
      updateProductVariantSchema.parse({
        id,
        price: '120',
        discountValue: '12.5',
      }),
    ).toMatchObject({ price: '120', discountValue: '12.5' });
  });

  it('rejects a missing id', () => {
    const result = updateProductVariantSchema.safeParse({ stockQuantity: 50 });

    expect(result.error?.issues.map(({ path }) => path)).toEqual([['id']]);
  });
});
