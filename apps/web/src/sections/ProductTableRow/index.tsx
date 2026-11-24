'use client'

import Link from 'next/link'
import { Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ProductStatus, RoastLevel } from '@repo/constants'
import { type Product } from '@/types/product'
import { formatPrice } from '@/utils/common'
import { getProductListPrice, getProductPrimaryImageUrl } from '@/utils/product'
import { cn } from '@/utils/styles'
import { type OptionItem } from '@/types/common'
import { ROUTES, dashboardEditPath } from '@/constants/routes'
import { buttonVariants } from '@/components/ui/button'

type ProductWithCategoryName = Product & {
  categoryName?: string | null
  category?: { name?: string | null } | null
}

function readProductCategory(
  product: ProductWithCategoryName,
  categoryOptions: OptionItem[],
): string {
  const category = categoryOptions.find(
    (option) => String(option.value) === product.categoryId,
  )
  if (!category) return '—'
  return category.label
}

function readProductStock(product: Product): number {
  return product.variants.reduce((total, variant) => {
    const stock = Number.isFinite(variant.stockQuantity)
      ? variant.stockQuantity
      : 0
    return total + stock
  }, 0)
}

function formatRoastLevel(level: Product['roastLevel']): string {
  switch (level) {
    case RoastLevel.LIGHT:
      return 'Light Roast'
    case RoastLevel.MEDIUM:
      return 'Medium Roast'
    case RoastLevel.DARK:
      return 'Dark Roast'
    default:
      return 'Unknown roast'
  }
}

function getStatusStyles(status: ProductStatus): string {
  switch (status) {
    case ProductStatus.ACTIVE:
      return 'bg-emerald-100 text-emerald-700'
    case ProductStatus.INACTIVE:
      return 'bg-muted text-muted-foreground'
    case ProductStatus.ARCHIVED:
      return 'bg-foreground/10 text-foreground/70'
    default:
      return 'bg-amber-100 text-amber-700'
  }
}

export interface ProductTableRowProps {
  product: Product
  categoryOptions: OptionItem[]
  onRequestDelete?: (product: Product) => void
}

export function ProductTableRow({
  product,
  categoryOptions,
  onRequestDelete,
}: ProductTableRowProps) {
  const productName = product.name?.trim() || 'Untitled product'
  const categoryLabel = readProductCategory(product, categoryOptions)
  const roastLevel = formatRoastLevel(product.roastLevel)
  const origin = product.origin?.trim() || 'Unknown origin'
  const status = product.status ?? ProductStatus.DRAFT
  const isDeleted = Boolean(product.deletedAt)
  const stock = readProductStock(product)
  const price = getProductListPrice(product)
  const imageUrl = getProductPrimaryImageUrl(product)
  const subtitle = `${origin} • ${roastLevel}`

  return (
    <>
      <td className="min-w-0 px-6 py-4 align-middle">
        <div className="flex min-w-0 items-start gap-3">
          <div className="size-14 shrink-0 overflow-hidden rounded-sm bg-muted">
            <Avatar className="size-14 rounded-sm after:rounded-sm after:border-transparent">
              <AvatarImage
                src={imageUrl ?? ''}
                alt={productName}
                className="rounded-sm"
              />
              <AvatarFallback className="rounded-sm text-xs font-semibold">
                {productName.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0 flex-1 space-y-0.5 text-left">
            <p
              title={productName}
              className="truncate font-semibold leading-tight text-foreground"
            >
              {productName}
            </p>
            <p
              title={subtitle}
              className="line-clamp-2 text-sm text-muted-foreground"
            >
              {subtitle}
            </p>
          </div>
        </div>
      </td>
      <td
        data-label="Category"
        className="min-w-0 px-6 py-4 align-middle text-center"
      >
        <Badge
          variant="secondary"
          title={categoryLabel}
          className="block h-auto min-h-7 max-w-full truncate rounded-2xl px-4 py-1.5 text-center text-xs font-semibold leading-snug md:w-full lg:text-sm"
        >
          {categoryLabel}
        </Badge>
      </td>
      <td data-label="Price" className="px-6 py-4 align-middle text-center">
        <p className="text-sm font-semibold text-foreground">
          {formatPrice(price, 'en-US', 'USD')}
        </p>
      </td>
      <td data-label="Stock" className="px-6 py-4 align-middle">
        <p className="text-sm text-center font-semibold text-foreground">
          {stock}
        </p>
      </td>
      <td data-label="Status" className="px-6 py-4 align-middle text-center">
        <Badge
          className={cn(
            'h-7 px-3 text-[0.65rem] uppercase',
            getStatusStyles(status),
          )}
        >
          {status}
        </Badge>
      </td>
      <td data-label="Actions" className="px-6 py-4 align-middle">
        <div className="flex justify-end gap-1">
          <Link
            href={dashboardEditPath(ROUTES.DASHBOARD_PRODUCTS, product.id)}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
              (!product.id || isDeleted) && 'pointer-events-none opacity-50',
            )}
            aria-label={`Edit ${productName}`}
            aria-disabled={!product.id || isDeleted}
            onClick={(e) => {
              if (!product.id || isDeleted) e.preventDefault()
            }}
          >
            <Pencil className="size-4" aria-hidden />
          </Link>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Delete ${productName}`}
            disabled={!onRequestDelete || !product.id || isDeleted}
            onClick={() => {
              if (!product.id || !onRequestDelete || isDeleted) return
              onRequestDelete(product)
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </td>
    </>
  )
}
