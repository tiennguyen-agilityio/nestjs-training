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

const toCents = (amount: string | number): number =>
  Math.round(Number(amount) * 100);

const fromCents = (cents: number): number => cents / 100;

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
