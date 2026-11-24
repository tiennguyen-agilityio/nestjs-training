import {
  addCartItemSchema,
  mergeCartSchema,
  updateCartItemSchema,
} from './cart.js';

const VARIANT_ID = '3f1c2a5e-8b4d-4e6f-9a7b-1c2d3e4f5a6b';

describe('addCartItemSchema', () => {
  it('defaults quantity to 1', () => {
    expect(addCartItemSchema.parse({ productVariantId: VARIANT_ID })).toEqual({
      productVariantId: VARIANT_ID,
      quantity: 1,
    });
  });

  it('rejects a non-UUID productVariantId and a missing one', () => {
    expect(
      addCartItemSchema.safeParse({ productVariantId: 'abc' }).error?.issues[0],
    ).toMatchObject({ code: 'invalid_format', format: 'uuid' });
    expect(addCartItemSchema.safeParse({}).error?.issues[0]).toMatchObject({
      code: 'invalid_type',
      path: ['productVariantId'],
    });
  });
});

describe('cart quantity', () => {
  it.each([0, 1.5, '2', null])(
    'quantity rejects %s on both schemas',
    (quantity) => {
      expect(
        addCartItemSchema.safeParse({ productVariantId: VARIANT_ID, quantity })
          .success,
      ).toBe(false);
      expect(updateCartItemSchema.safeParse({ quantity }).success).toBe(false);
    },
  );
});

describe('updateCartItemSchema', () => {
  it('requires quantity', () => {
    expect(updateCartItemSchema.safeParse({}).error?.issues[0]).toMatchObject({
      code: 'invalid_type',
      path: ['quantity'],
    });
  });

  it('strips unknown keys', () => {
    expect(updateCartItemSchema.parse({ quantity: 2, foo: 1 })).toEqual({
      quantity: 2,
    });
  });
});

describe('mergeCartSchema', () => {
  const lines = (count: number) =>
    Array.from({ length: count }, () => ({
      productVariantId: VARIANT_ID,
      quantity: 1,
    }));

  it('mergeCartSchema accepts the guest lines', () => {
    const body = { items: [{ productVariantId: VARIANT_ID, quantity: 2 }] };
    expect(mergeCartSchema.parse(body)).toEqual(body);
    expect(mergeCartSchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it.each([{ items: 'x' }, { items: {} }, {}])(
    'mergeCartSchema rejects items that is not an array (%o)',
    (body) => {
      expect(mergeCartSchema.safeParse(body).error?.issues[0]).toMatchObject({
        code: 'invalid_type',
        path: ['items'],
      });
    },
  );

  it('mergeCartSchema requires quantity', () => {
    expect(
      mergeCartSchema.safeParse({ items: [{ productVariantId: VARIANT_ID }] })
        .error?.issues[0],
    ).toMatchObject({ code: 'invalid_type', path: ['items', 0, 'quantity'] });
  });

  it('mergeCartSchema rejects more than 50 lines', () => {
    expect(mergeCartSchema.safeParse({ items: lines(50) }).success).toBe(true);
    expect(
      mergeCartSchema.safeParse({ items: lines(51) }).error?.issues[0],
    ).toMatchObject({ code: 'too_big', path: ['items'] });
  });

  it.each([
    { productVariantId: VARIANT_ID, quantity: 0 },
    { productVariantId: VARIANT_ID, quantity: 1.5 },
    { productVariantId: 'abc', quantity: 1 },
  ])('mergeCartSchema rejects a bad line (%o)', (line) => {
    expect(mergeCartSchema.safeParse({ items: [line] }).success).toBe(false);
  });
});
