import { formatCurrency } from '@/utils/cart'
import { cn } from '@/utils/styles'

export interface SalePriceProps {
  /** The price the shopper pays (the sale price). */
  price: number
  /** The price before the discount; struck through only when higher. */
  listPrice?: number
  className?: string
  listPriceClassName?: string
}

const SalePrice = ({
  price,
  listPrice,
  className,
  listPriceClassName,
}: SalePriceProps) => {
  const hasDiscount = listPrice !== undefined && listPrice > price

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={className}>{formatCurrency(price)}</span>
      {hasDiscount ? (
        <del
          className={cn(
            'text-sm font-normal text-on-surface-variant',
            listPriceClassName,
          )}
        >
          {formatCurrency(listPrice)}
        </del>
      ) : null}
    </span>
  )
}

export default SalePrice
