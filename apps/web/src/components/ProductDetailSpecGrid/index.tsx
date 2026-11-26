import type { ReactNode } from 'react'

import {
  ROAST_LEVEL_OPTIONS,
  ROAST_LEVEL_SPECTRUM_PERCENT,
} from '@/constants/roast'
import type { Product } from '@/types/product'
import { cn } from '@/utils/styles'

export interface ProductDetailSpecGridProps {
  product: Product
  className?: string
}

export function ProductDetailSpecGrid({
  product,
  className,
}: ProductDetailSpecGridProps) {
  const roastLabel =
    ROAST_LEVEL_OPTIONS.find(
      (o) => o.value === product.roastLevel,
    )?.label?.replace(' Roast', '') ?? product.roastLevel
  const spectrum = ROAST_LEVEL_SPECTRUM_PERCENT[product.roastLevel]
  const notes =
    (product.tastingNotes ?? '').trim() ||
    product.description?.trim().slice(0, 80) ||
    '—'
  const origin = product.origin?.trim() || '—'
  const processing = product.processingMethod?.trim() || '—'

  return (
    <div
      className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}
      data-testid="product-detail-spec-grid"
    >
      <SpecCard label="Origin" value={origin} />
      <SpecCard label="Roast Level" value={roastLabel}>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-container-high/90"
          role="presentation"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${spectrum}%` }}
          />
        </div>
      </SpecCard>
      <SpecCard label="Processing" value={processing} />
      <SpecCard
        label="Notes"
        value={notes}
        valueClassName="font-medium normal-case tracking-normal"
      />
    </div>
  )
}

function SpecCard({
  label,
  value,
  children,
  valueClassName,
}: {
  label: string
  value: string
  children?: ReactNode
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border border-primary/10 bg-surface-container-low p-4 shadow-sm dark:border-border md:p-5">
      <p className="text-xs font-bold tracking-wide text-on-surface-variant uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-sm text-on-surface md:text-base',
          valueClassName,
        )}
      >
        {value}
      </p>
      {children}
    </div>
  )
}
