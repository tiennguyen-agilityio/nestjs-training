import { VALIDATION_RULES } from '@repo/constants';
import { generateOrderNumber } from './order-number.util.js';

describe('generateOrderNumber', () => {
  it('generateOrderNumber matches ORD-<base36>-<4 chars>', () => {
    const orderNumber = generateOrderNumber();

    expect(orderNumber).toMatch(/^ORD-[0-9A-Z]+-[0-9A-Z]{4}$/);
    expect(orderNumber.length).toBeLessThanOrEqual(
      VALIDATION_RULES.ORDER.NUMBER_MAX_LENGTH,
    );
  });

  it('generateOrderNumber encodes the current time in base36', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    expect(generateOrderNumber().split('-')[1]).toBe(
      (1_700_000_000_000).toString(36).toUpperCase(),
    );
    vi.restoreAllMocks();
  });

  it('generateOrderNumber keeps 4 random characters when Math.random is short', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(generateOrderNumber()).toMatch(/^ORD-[0-9A-Z]+-[0-9A-Z]{4}$/);
    vi.restoreAllMocks();
  });
});
