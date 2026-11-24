import { VALIDATION_RULES } from '@repo/constants';

export interface OrderLineAmounts {
  unitPrice: number;
  discountAmount: number;
  quantity: number;
}

export interface OrderTotals {
  subTotal: number;
  tax: number;
  totalAmount: number;
}

const toCents = (amount: number): number => Math.round(amount * 100);

const fromCents = (cents: number): number => cents / 100;

export const lineTotalCentsOf = (line: OrderLineAmounts): number =>
  (toCents(line.unitPrice) - toCents(line.discountAmount)) * line.quantity;

export const orderTotalsOf = (
  lines: OrderLineAmounts[],
  shippingFee: number,
): OrderTotals => {
  const subTotalCents = lines.reduce(
    (total, line) => total + lineTotalCentsOf(line),
    0,
  );
  const taxCents = Math.round(
    (subTotalCents * VALIDATION_RULES.ORDER.TAX_PERCENT) / 100,
  );

  return {
    subTotal: fromCents(subTotalCents),
    tax: fromCents(taxCents),
    totalAmount: fromCents(subTotalCents + toCents(shippingFee) + taxCents),
  };
};
