import { availableQuantityOf } from './stock.util.js';

describe('availableQuantityOf', () => {
  it('availableQuantityOf subtracts reserved and never goes below 0', () => {
    expect(availableQuantityOf({ stockQuantity: 5, reservedQuantity: 2 })).toBe(
      3,
    );
    expect(availableQuantityOf({ stockQuantity: 1, reservedQuantity: 1 })).toBe(
      0,
    );
    expect(availableQuantityOf({ stockQuantity: 1, reservedQuantity: 3 })).toBe(
      0,
    );
  });
});
