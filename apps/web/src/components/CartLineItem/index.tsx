'use client'

import Image from 'next/image'
import { Trash2 } from 'lucide-react'

import { Quantity } from '@/components/Quantity'
import SalePrice from '@/components/SalePrice'
import { Button } from '@/components/ui/button'
import { ERROR_MESSAGES } from '@/constants/messages'
import { OUT_OF_STOCK_LABEL } from '@/constants/order'
import type { CartItem } from '@/types/cart'
import { isCartItemOutOfStock } from '@/utils/inventory'
import { cn } from '@/utils/styles'

export interface CartLineItemProps {
  item: CartItem
  onChangeQuantity: (itemId: string, amount: number) => void
  onRemove: (itemId: string) => void
  disabled?: boolean
  className?: string
}

export function CartLineItem({
  item,
  onChangeQuantity,
  onRemove,
  disabled = false,
  className,
}: CartLineItemProps) {
  const maxQuantity = item.maxQuantity ?? 99
  const lineOutOfStock = isCartItemOutOfStock(item)

  return (
    <article
      className={cn(
        'flex gap-4 rounded-3xl border border-outline-variant/70 bg-surface-container-low p-4 shadow-sm md:gap-6 md:p-5',
        className,
      )}
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-surface-container-high md:size-28">
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          className="object-cover"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-on-surface">
              {item.name}
            </h3>
            <p className="text-sm text-on-surface-variant">{item.meta}</p>
            {lineOutOfStock ? (
              <p className="text-sm font-medium text-destructive" role="status">
                {OUT_OF_STOCK_LABEL}
              </p>
            ) : null}
            {item.exceedsStock ? (
              <p
                className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-destructive"
                role="status"
              >
                <span>
                  {ERROR_MESSAGES.CART_LINE_EXCEEDS_STOCK(
                    maxQuantity,
                    item.quantity,
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-auto px-0 py-0 text-sm font-bold text-primary"
                  onClick={() => onChangeQuantity(item.id, maxQuantity)}
                  disabled={disabled}
                >
                  Change to {maxQuantity}
                </Button>
              </p>
            ) : null}
          </div>
          <p className="shrink-0 text-2xl font-bold text-primary">
            <SalePrice price={item.unitPrice} listPrice={item.listPrice} />
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Quantity
            value={item.quantity}
            min={1}
            max={maxQuantity}
            // A line above the stock steps straight down to the stock left.
            onChange={(amount) => {
              onChangeQuantity(item.id, Math.min(amount, maxQuantity))
            }}
            disabled={disabled || lineOutOfStock}
          />

          <Button
            type="button"
            variant="ghost"
            className="h-auto w-auto gap-1 px-0 py-0 text-sm font-semibold text-destructive"
            aria-label={`Remove ${item.name}`}
            onClick={() => onRemove(item.id)}
            disabled={disabled}
          >
            <Trash2 className="size-4" aria-hidden />
            Remove
          </Button>
        </div>
      </div>
    </article>
  )
}
