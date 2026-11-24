import {
  discountValueField,
  priceField,
  sizeField,
  stockQuantityField,
} from './number.js';

describe('number fields', () => {
  it.each([
    ['sizeField', sizeField, 1, 99999999.99, 0, 100000000],
    ['priceField', priceField, 1, 99999999.99, 0, 100000000],
    ['discountValueField', discountValueField, 0, 99999999.99, -1, 100000000],
  ])(
    '%s accepts its bounds and rejects one past them',
    (_name, field, min, max, below, above) => {
      expect(field.safeParse(min).success).toBe(true);
      expect(field.safeParse(max).success).toBe(true);
      expect(field.safeParse(below).error?.issues[0]).toMatchObject({
        code: 'too_small',
        origin: 'number',
        minimum: min,
      });
      expect(field.safeParse(above).error?.issues[0]).toMatchObject({
        code: 'too_big',
        origin: 'number',
        maximum: max,
      });
    },
  );

  it('stockQuantityField takes whole numbers from 0', () => {
    expect(stockQuantityField.safeParse(0).success).toBe(true);
    expect(stockQuantityField.safeParse(-1).error?.issues[0]).toMatchObject({
      code: 'too_small',
      minimum: 0,
    });
    expect(stockQuantityField.safeParse(1.5).error?.issues[0]).toMatchObject({
      code: 'invalid_type',
      expected: 'int',
    });
  });

  it("keeps Zod's default messages, which the API returns as description", () => {
    expect(priceField.safeParse(0).error?.issues[0].message).toBe(
      'Too small: expected number to be >=1',
    );
  });
});
