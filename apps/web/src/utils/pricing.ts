import { DiscountType, VALIDATION_RULES } from '@repo/constants'

/** The price fields a product variant carries (`GET /products`). */
export interface VariantPriceFields {
  price: number
  discountType: DiscountType | null
  discountValue: number | null
}

export interface VariantPricing {
  price: number
  salePrice: number
}

export const toCents = (amount: number): number => Math.round(amount * 100)

export const fromCents = (cents: number): number => cents / 100

/**
 * The API's rule (`apps/api/src/modules/cart/utils/cart-pricing.util.ts`):
 * a null discount is PERCENT 0, a percent discount is rounded to the cent.
 */
export const pricingOf = (variant: VariantPriceFields): VariantPricing => {
  const discountType = variant.discountType ?? DiscountType.PERCENT
  const discountValue = Number(variant.discountValue ?? 0)
  const priceCents = toCents(variant.price)
  const discountCents =
    discountType === DiscountType.FIXED
      ? toCents(discountValue)
      : Math.round((priceCents * discountValue) / 100)

  return {
    price: fromCents(priceCents),
    salePrice: fromCents(priceCents - discountCents),
  }
}

export const lineTotalOf = (salePrice: number, quantity: number): number =>
  fromCents(toCents(salePrice) * quantity)

export const sumOf = (amounts: number[]): number =>
  fromCents(amounts.reduce((total, amount) => total + toCents(amount), 0))

/** The order API's tax: `TAX_PERCENT` of the subtotal, rounded to the cent. */
export const taxOf = (subtotal: number): number =>
  fromCents(
    Math.round((toCents(subtotal) * VALIDATION_RULES.ORDER.TAX_PERCENT) / 100),
  )
