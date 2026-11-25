import { adjustStockSchema, restockStockSchema } from './inventory.js';

describe('restockStockSchema', () => {
  it('restockStockSchema needs a whole number from 1 to the max', () => {
    expect(restockStockSchema.parse({ quantity: 1 })).toEqual({ quantity: 1 });
    expect(restockStockSchema.safeParse({ quantity: 1000000 }).success).toBe(
      true,
    );
    for (const quantity of [0, 1.5, 1000001, '3']) {
      expect(restockStockSchema.safeParse({ quantity }).success).toBe(false);
    }
  });
});

describe('adjustStockSchema', () => {
  it('adjustStockSchema rejects 0 and accepts -3', () => {
    expect(
      adjustStockSchema.parse({ quantity: -3, reason: 'Damaged bags' }),
    ).toEqual({ quantity: -3, reason: 'Damaged bags' });
    const zero = adjustStockSchema.safeParse({ quantity: 0, reason: 'Count' });
    expect(zero.error?.issues[0].path).toEqual(['quantity']);
    expect(
      adjustStockSchema.safeParse({ quantity: -1000001, reason: 'Count' })
        .success,
    ).toBe(false);
  });

  it('adjustStockSchema trims the reason and needs 2–255 characters', () => {
    expect(
      adjustStockSchema.parse({ quantity: 2, reason: '  Found 2 bags  ' })
        .reason,
    ).toBe('Found 2 bags');
    for (const reason of ['   ', 'a', ' a ', 'x'.repeat(256)]) {
      const result = adjustStockSchema.safeParse({ quantity: 2, reason });
      expect(result.error?.issues[0].path).toEqual(['reason']);
    }
    expect(adjustStockSchema.safeParse({ quantity: 2 }).success).toBe(false);
  });
});
