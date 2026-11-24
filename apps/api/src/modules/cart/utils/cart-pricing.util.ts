import { DiscountType } from '@repo/constants';

export interface VariantPriceFields {
  price: string | number;
  discountType: DiscountType | null;
  discountValue: string | number | null;
}

export interface VariantPricing {
  price: number;
  discountType: DiscountType;
  discountValue: number;
  salePrice: number;
}

// Money is worked out in whole cents, so sums never drift (0.1 + 0.2).
const toCents = (amount: string | number): number =>
  Math.round(Number(amount) * 100);

const fromCents = (cents: number): number => cents / 100;

/**
 * The variant's current price and the price after its discount (design ›
 * Prices). A stored null discount reads as PERCENT 0, as on the product read.
 * Discount per unit: PERCENT → price × value / 100, FIXED → value; rounded
 * half up to the cent.
 */
export const pricingOf = (variant: VariantPriceFields): VariantPricing => {
  const discountType = variant.discountType ?? DiscountType.PERCENT;
  const discountValue = Number(variant.discountValue ?? 0);
  const priceCents = toCents(variant.price);
  const discountCents =
    discountType === DiscountType.FIXED
      ? toCents(discountValue)
      : Math.round((priceCents * discountValue) / 100);

  return {
    price: fromCents(priceCents),
    discountType,
    discountValue,
    salePrice: fromCents(priceCents - discountCents),
  };
};

export const lineTotalOf = (salePrice: number, quantity: number): number =>
  fromCents(toCents(salePrice) * quantity);

export const sumOf = (amounts: number[]): number =>
  fromCents(amounts.reduce((total, amount) => total + toCents(amount), 0));
