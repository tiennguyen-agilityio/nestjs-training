'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import SalePrice from '@/components/SalePrice'
import { Carousel } from '@/components/Carousel'
import { ProductDetailRatingRow } from '@/components/ProductDetailRatingRow'
import { ProductDetailSpecGrid } from '@/components/ProductDetailSpecGrid'
import { ProductPurchasePanel } from '@/components/ProductPurchasePanel'
import { ProductReviewsSection } from '@/components/ProductReviewsSection'
import { ProductTrustRow } from '@/components/ProductTrustRow'
import { Button } from '@/components/ui/button'

import { EMPTY_IMAGE } from '@/constants/images'
import { SERIES_KICKER } from '@/constants/product'
import { useProductById } from '@/hooks/useProduct'
import { type ProductImage } from '@/types/product'
import { getProductPricing, getStockBadgeLabel } from '@/utils/product'
import { cn } from '@/utils/styles'

const ROASTS_LIST_HREF = '/roasts'

export default function RoastDetailPageContent() {
  const { id: productId = '' } = useParams<{ id: string }>()

  const { product, isLoading, isError, errorMessage, refetch } =
    useProductById(productId)

  if (!productId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <p className="text-on-surface-variant">Missing product id.</p>
        <Link
          href={ROASTS_LIST_HREF}
          className="mt-4 inline-block font-semibold text-primary underline-offset-4 hover:underline"
        >
          Back to roasts
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-background" data-testid="roast-detail-loading">
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-8 md:py-12">
          <div className="h-10 w-40 animate-pulse rounded-md bg-surface-container-high" />
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="aspect-square max-w-md animate-pulse rounded-3xl bg-surface-container-high" />
            <div className="space-y-4">
              <div className="h-10 w-3/4 animate-pulse rounded-md bg-surface-container-high" />
              <div className="h-8 w-32 animate-pulse rounded-md bg-surface-container-high" />
              <div className="h-24 animate-pulse rounded-md bg-surface-container-high" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isError || !product) {
    return (
      <div className="bg-background">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 text-center md:px-8 md:py-12">
          <p className="text-on-surface-variant">
            {errorMessage ?? 'Unable to load this roast.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => void refetch()} variant="outline">
              Retry
            </Button>
            <Link
              href={ROASTS_LIST_HREF}
              className="inline-flex h-12 items-center justify-center rounded-full px-4 text-sm font-semibold text-primary hover:opacity-90"
            >
              Back to roasts
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { listPrice, salePrice } = getProductPricing(product)
  const desc = product.description?.trim()
  const tasting = product.tastingNotes?.trim()

  const productImages = [...product.images].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  const stockBadgeLabel = getStockBadgeLabel(product)

  return (
    <div className={cn('min-w-0 w-full', 'bg-background text-on-surface')}>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-14">
        <nav className="mb-10">
          <Link
            href={ROASTS_LIST_HREF}
            className="text-sm font-medium text-on-surface-variant transition-colors hover:text-primary"
          >
            ← All roasts
          </Link>
        </nav>

        <div className="grid gap-12 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-start md:gap-16">
          <div
            className="relative space-y-5"
            data-testid="product-detail-gallery"
          >
            {stockBadgeLabel ? (
              <span
                className={cn(
                  'absolute top-3 left-3 z-10 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide',
                  'bg-surface-container-highest text-on-surface',
                )}
              >
                {stockBadgeLabel}
              </span>
            ) : null}
            <Carousel
              className="max-w-xl md:max-w-none"
              slideAreaClassName="aspect-square w-full overflow-hidden rounded-3xl bg-surface-container shadow-sm"
              items={productImages}
              renderItem={({ url }: ProductImage) => (
                <div className="relative aspect-square h-full min-h-0 w-full">
                  <Image
                    src={url ?? EMPTY_IMAGE}
                    alt={product.name}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              renderDotItem={({ url }: ProductImage) => (
                <div className="relative aspect-square h-full min-h-0 w-full">
                  <Image
                    src={url ?? EMPTY_IMAGE}
                    alt={product.name}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-5 md:pt-1">
            <p className="text-[11px] font-bold tracking-[0.28em] text-primary uppercase">
              {SERIES_KICKER}
            </p>
            <h1 className="font-pdp text-4xl leading-[1.15] text-on-surface md:text-5xl">
              {product.name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <p className="text-3xl font-bold text-primary md:text-4xl">
                <SalePrice
                  price={salePrice}
                  listPrice={listPrice}
                  listPriceClassName="text-xl md:text-2xl"
                />
              </p>
              {product.variants[0]?.name ? (
                <p className="text-on-surface-variant">
                  {product.variants[0].name}
                </p>
              ) : null}
              <ProductDetailRatingRow />
            </div>

            {desc ? (
              <p className="max-w-prose text-base leading-relaxed text-on-surface-variant md:text-lg">
                {desc}
              </p>
            ) : tasting ? (
              <p className="max-w-prose text-base leading-relaxed text-on-surface-variant md:text-lg">
                {tasting}
              </p>
            ) : null}

            <ProductDetailSpecGrid product={product} className="pt-1" />

            <ProductPurchasePanel product={product} />

            <ProductTrustRow />
          </div>
        </div>

        <ProductReviewsSection className="mt-20 md:mt-28" />
      </div>
    </div>
  )
}
