import { addCartItemSchema, updateCartItemSchema } from './cart.js';

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
