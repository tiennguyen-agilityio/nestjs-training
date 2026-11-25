import { StockLevel } from '../enums/order.enum.js';
import { stockLevelOf } from './stock-level.js';

describe('stockLevelOf', () => {
  it('stockLevelOf returns OUT at 0, LOW at 5, OK at 6', () => {
    expect(stockLevelOf(0)).toBe(StockLevel.OUT);
    expect(stockLevelOf(-1)).toBe(StockLevel.OUT);
    expect(stockLevelOf(1)).toBe(StockLevel.LOW);
    expect(stockLevelOf(5)).toBe(StockLevel.LOW);
    expect(stockLevelOf(6)).toBe(StockLevel.OK);
  });
});
